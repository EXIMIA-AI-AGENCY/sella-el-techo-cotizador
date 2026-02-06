const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db', 'pricing.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDatabase();
  }
  return db;
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      unit TEXT NOT NULL,
      price REAL NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      label TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed default products if table is empty
  const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  if (count === 0) {
    const insertProduct = db.prepare(`
      INSERT INTO products (slug, name, description, unit, price)
      VALUES (@slug, @name, @description, @unit, @price)
    `);

    const defaultProducts = [
      {
        slug: 'silicona',
        name: 'Silicona 100%',
        description: 'Sellado premium reflectivo',
        unit: 'sqft',
        price: 4.50
      },
      {
        slug: 'danosa',
        name: 'Danosa',
        description: 'Membrana asfáltica',
        unit: 'sqft',
        price: 3.50
      },
      {
        slug: 'danosa_removal',
        name: 'Remoción Danosa (por capa)',
        description: 'Cargo adicional por capa removida',
        unit: 'sqft',
        price: 1.00
      },
      {
        slug: 'cisterna',
        name: 'Cisterna',
        description: 'Manejo y movimiento de cisterna',
        unit: 'flat',
        price: 150.00
      },
      {
        slug: 'placas_solares',
        name: 'Placas Solares',
        description: 'Remoción y desmontaje de placas solares',
        unit: 'flat',
        price: 1000.00
      },
      {
        slug: 'ac',
        name: 'Aire Acondicionado',
        description: 'Manejo de unidad de aire acondicionado',
        unit: 'flat',
        price: 200.00
      }
    ];

    const insertMany = db.transaction((products) => {
      for (const p of products) {
        insertProduct.run(p);
      }
    });

    insertMany(defaultProducts);
  }

  // Seed default settings if empty
  const settingsCount = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
  if (settingsCount === 0) {
    const insertSetting = db.prepare(`
      INSERT INTO settings (key, value, label) VALUES (@key, @value, @label)
    `);

    const defaults = [
      { key: 'tax_rate', value: '0.115', label: 'Tasa de IVU (11.5%)' },
      { key: 'waste_factor', value: '1.15', label: 'Factor de desperdicio (15%)' }
    ];

    for (const s of defaults) {
      insertSetting.run(s);
    }
  }
}

// --- Product CRUD ---

function getAllProducts() {
  return getDb().prepare('SELECT * FROM products ORDER BY id').all();
}

function getActiveProducts() {
  return getDb().prepare('SELECT * FROM products WHERE active = 1 ORDER BY id').all();
}

function getProductBySlug(slug) {
  return getDb().prepare('SELECT * FROM products WHERE slug = ?').get(slug);
}

function getProductById(id) {
  return getDb().prepare('SELECT * FROM products WHERE id = ?').get(id);
}

function updateProduct(id, data) {
  const product = getProductById(id);
  if (!product) return null;

  const stmt = getDb().prepare(`
    UPDATE products
    SET name = @name, description = @description, unit = @unit,
        price = @price, active = @active, updated_at = datetime('now')
    WHERE id = @id
  `);

  stmt.run({
    id,
    name: data.name ?? product.name,
    description: data.description ?? product.description,
    unit: data.unit ?? product.unit,
    price: data.price ?? product.price,
    active: data.active ?? product.active
  });

  return getProductById(id);
}

function createProduct(data) {
  const stmt = getDb().prepare(`
    INSERT INTO products (slug, name, description, unit, price)
    VALUES (@slug, @name, @description, @unit, @price)
  `);

  const result = stmt.run({
    slug: data.slug,
    name: data.name,
    description: data.description || '',
    unit: data.unit,
    price: data.price
  });

  return getProductById(result.lastInsertRowid);
}

function deleteProduct(id) {
  return getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
}

// --- Settings CRUD ---

function getAllSettings() {
  return getDb().prepare('SELECT * FROM settings ORDER BY key').all();
}

function getSetting(key) {
  return getDb().prepare('SELECT * FROM settings WHERE key = ?').get(key);
}

function updateSetting(key, value) {
  const existing = getSetting(key);
  if (!existing) return null;

  getDb().prepare(`
    UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?
  `).run(value, key);

  return getSetting(key);
}

// --- Pricing bundle for frontend ---

function getPricingBundle() {
  const products = getActiveProducts();
  const settings = getAllSettings();

  const pricing = {};
  for (const p of products) {
    pricing[p.slug] = {
      name: p.name,
      price: p.price,
      unit: p.unit,
      description: p.description
    };
  }

  const config = {};
  for (const s of settings) {
    config[s.key] = parseFloat(s.value);
  }

  return { pricing, config };
}

module.exports = {
  getDb,
  getAllProducts,
  getActiveProducts,
  getProductBySlug,
  getProductById,
  updateProduct,
  createProduct,
  deleteProduct,
  getAllSettings,
  getSetting,
  updateSetting,
  getPricingBundle
};
