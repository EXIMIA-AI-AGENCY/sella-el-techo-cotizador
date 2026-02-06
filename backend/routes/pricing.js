const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/pricing - Public endpoint: returns all active pricing for the frontend
router.get('/pricing', (req, res) => {
  try {
    const bundle = db.getPricingBundle();
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products - List all products (admin)
router.get('/products', (req, res) => {
  try {
    const products = db.getAllProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id - Get single product
router.get('/products/:id', (req, res) => {
  try {
    const product = db.getProductById(parseInt(req.params.id));
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products - Create new product
router.post('/products', (req, res) => {
  try {
    const { slug, name, description, unit, price } = req.body;
    if (!slug || !name || !unit || price == null) {
      return res.status(400).json({ error: 'Campos requeridos: slug, name, unit, price' });
    }

    // Check for duplicate slug
    const existing = db.getProductBySlug(slug);
    if (existing) {
      return res.status(409).json({ error: `Ya existe un producto con slug "${slug}"` });
    }

    const product = db.createProduct({ slug, name, description, unit, price: parseFloat(price) });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id - Update product
router.put('/products/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, unit, price, active } = req.body;

    const updated = db.updateProduct(id, {
      name,
      description,
      unit,
      price: price != null ? parseFloat(price) : undefined,
      active: active != null ? (active ? 1 : 0) : undefined
    });

    if (!updated) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id - Delete product
router.delete('/products/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = db.getProductById(id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    db.deleteProduct(id);
    res.json({ message: 'Producto eliminado', product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings - List all settings
router.get('/settings', (req, res) => {
  try {
    const settings = db.getAllSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/:key - Update setting
router.put('/settings/:key', (req, res) => {
  try {
    const { value } = req.body;
    if (value == null) return res.status(400).json({ error: 'Campo requerido: value' });

    const updated = db.updateSetting(req.params.key, String(value));
    if (!updated) return res.status(404).json({ error: 'Configuración no encontrada' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
