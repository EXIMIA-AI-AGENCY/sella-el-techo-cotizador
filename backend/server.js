const express = require('express');
const cors = require('cors');
const path = require('path');
const pricingRoutes = require('./routes/pricing');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve admin panel
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// API routes
app.use('/api', pricingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Sella El Techo Backend running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log(`API pricing: http://localhost:${PORT}/api/pricing`);
});
