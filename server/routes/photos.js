import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const photosDir = path.join(__dirname, '../../data/photos');

// Ensure photos directory exists
if (!fs.existsSync(photosDir)) {
  fs.mkdirSync(photosDir, { recursive: true });
}

// Get list of photo folders
router.get('/folders', (req, res) => {
  try {
    const folders = fs.readdirSync(photosDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const folderPath = path.join(photosDir, dirent.name);
        const images = getImagesInFolder(folderPath);
        return {
          name: dirent.name,
          imageCount: images.length,
          preview: images[0] || null
        };
      });
    res.json(folders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get images in a specific folder
router.get('/folders/:folder', (req, res) => {
  try {
    const folderPath = path.join(photosDir, req.params.folder);

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const images = getImagesInFolder(folderPath).map(img => ({
      name: img,
      url: `/media/photos/${req.params.folder}/${img}`
    }));

    res.json(images);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new folder
router.post('/folders', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    // Sanitize folder name
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-');
    const folderPath = path.join(photosDir, safeName);

    if (fs.existsSync(folderPath)) {
      return res.status(400).json({ error: 'Folder already exists' });
    }

    fs.mkdirSync(folderPath);
    res.json({ name: safeName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get image files in a folder
function getImagesInFolder(folderPath) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  return fs.readdirSync(folderPath)
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    })
    .sort();
}

export default router;
