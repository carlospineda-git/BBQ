const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const fs = require('fs'); 

const app = express();
const PORT = 3000;

// ===============================
// CONFIG & DB
// ===============================
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";
const SECRET = "mysecretkey";
const DB_FILE = './database.json'; 

let db_data = {
  config: { openHour: 10, closeHour: 21 },
  products: [
    { id: 1, name: "BBQ Chicken", price: 120, stock: 10, salesCount: 0, img: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d" },
    { id: 2, name: "Pork BBQ", price: 100, stock: 8, salesCount: 0, img: "https://images.unsplash.com/photo-1600891964599-f61ba0e24092" },
    { id: 3, name: "Grilled Fish", price: 150, stock: 5, salesCount: 0, img: "https://images.unsplash.com/photo-1544025162-d76694265947" }
  ],
  orders: [],
  bannedIPs: []
};

if (fs.existsSync(DB_FILE)) {
  try {
    db_data = JSON.parse(fs.readFileSync(DB_FILE));
  } catch (e) {
    console.error("Error reading database file, using defaults");
  }
}

let config = db_data.config || { openHour: 10, closeHour: 21 };
let products = db_data.products || [];
let orders = db_data.orders || [];
let bannedIPs = db_data.bannedIPs || [];

function saveAll() {
  const dataToSave = { config, products, orders, bannedIPs };
  fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2));
}

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function isStoreOpen() {
  const hour = new Date().getHours();
  return hour >= config.openHour && hour < config.closeHour; 
}

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(403).json({ error: "No token provided" });
  try {
    const verified = jwt.verify(token, SECRET);
    req.user = verified;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

const orderLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, 
  max: 3, 
  message: { error: "Too many orders. Please try again after 30 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ===============================
// ROUTES
// ===============================

app.get('/store-status', (req, res) => {
  res.json({ 
    isOpen: isStoreOpen(), 
    open: config.openHour, 
    close: config.closeHour,
    hours: `${config.openHour}:00 - ${config.closeHour}:00` 
  });
});

app.post('/update-hours', auth, (req, res) => {
  const { open, close } = req.body;
  if (open !== undefined && close !== undefined) {
    config.openHour = Number(open);
    config.closeHour = Number(close);
    saveAll(); 
    res.json({ message: "Hours updated successfully", config });
  } else {
    res.status(400).json({ error: "Invalid data provided" });
  }
});

app.get('/banned-ips', auth, (req, res) => {
  res.json(bannedIPs);
});

app.post('/unblock-ip', auth, (req, res) => {
  const { ip } = req.body;
  bannedIPs = bannedIPs.filter(user => user.ip !== ip);
  saveAll(); 
  res.json({ message: "User unblocked" });
});

app.post('/order', orderLimiter, async (req, res) => {
  const userIP = req.ip || req.connection.remoteAddress;

  if (!isStoreOpen()) {
    return res.status(403).json({ error: `Store is closed. Open from ${config.openHour}:00 to ${config.closeHour}:00.` });
  }

  if (bannedIPs.some(b => b.ip === userIP)) {
    return res.status(403).json({ error: "Your access has been restricted." });
  }

  const { name, street, block, lot, cart, captchaToken } = req.body;

  if (!captchaToken) {
    return res.status(400).json({ error: "Security check required. Please complete the Captcha." });
  }

  if (!name?.trim() || !street?.trim() || !block?.trim() || !lot?.trim() || !cart?.length) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const secretKey = "6Ldsz-IsAAAAAA8r3frSZVy75R_Gpr6If0u5HMNc"; 
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaToken}`;
    const googleRes = await fetch(verifyUrl, { method: 'POST' });
    const googleData = await googleRes.json();

    if (!googleData.success) {
      return res.status(400).json({ error: "Captcha verification failed." });
    }

    let total = 0;
    
    for (let item of cart) {
      const product = products.find(p => p.id === item.id);
      if (!product) return res.status(400).json({ error: "Invalid product" });
      
      if (Number(item.qty) > Number(product.stock)) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }
      total += product.price * item.qty;
    }
   
    for (let item of cart) {
      const product = products.find(p => p.id === item.id);
      product.stock -= Number(item.qty);
      product.salesCount = (product.salesCount || 0) + Number(item.qty);
    }
    
    const order = {
      id: Date.now(),
      name,
      address: `${street}, Block ${block}, Lot ${lot}`,
      cart,
      total,
      status: "Pending",
      ip: userIP,
      date: new Date(),
      rated: false
    };

    orders.push(order);
    saveAll(); 
    res.json({ message: "Order placed successfully", order });

  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/my-orders/:name', (req, res) => {
  const customerName = req.params.name;
  res.json(orders.filter(o => o.name.toLowerCase() === customerName.toLowerCase()));
});

// FIXED: Added missing rate-order endpoint so rating actions don't break order sync
app.post('/rate-order', (req, res) => {
  const { orderId, rating, comment } = req.body;
  const order = orders.find(o => o.id === Number(orderId));
  if (!order) return res.status(404).json({ error: "Order not found" });
  
  order.rated = true;
  order.rating = rating;
  order.comment = comment || "";
  saveAll();
  res.json({ message: "Review submitted successfully!" });
});

app.get('/products', (req, res) => res.json(products));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username }, SECRET, { expiresIn: '1h' });
    return res.json({ token });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

app.post('/block-ip', auth, (req, res) => {
  const { ip, name } = req.body;
  if (!ip) return res.status(400).json({ error: "Invalid IP" });
  if (!bannedIPs.find(b => b.ip === ip)) {
    bannedIPs.push({ ip, name: name || "Unknown User" });
    orders = orders.filter(o => o.ip !== ip); 
    saveAll(); 
    res.json({ message: `User ${name} has been blocked.` });
  } else {
    res.status(400).json({ error: "User already blocked" });
  }
});

app.post('/add-product', auth, (req, res) => {
  const { name, price, stock, img } = req.body;
  const maxId = products.reduce((max, p) => (p.id > max ? p.id : max), 0);
  
  const newProduct = { id: maxId + 1, name, price, stock: Number(stock), salesCount: 0, img };
  products.push(newProduct);
  saveAll(); 
  res.json(newProduct);
});

app.put('/update-product/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const product = products.find(p => p.id === id);
  if (!product) return res.status(404).json({ error: "Not found" });
  Object.assign(product, req.body);
  saveAll(); 
  res.json({ message: "Updated", product });
});

app.delete('/delete-product/:id', auth, (req, res) => {
  products = products.filter(p => p.id !== Number(req.params.id));
  saveAll(); 
  res.json({ message: "Deleted" });
});

app.get('/orders', auth, (req, res) => res.json(orders));

app.put('/order-status/:id', auth, (req, res) => {
  const order = orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found" });
  order.status = req.body.status;
  saveAll(); 
  res.json({ message: "Order updated", order });
});

app.delete('/clear-orders', auth, (req, res) => {
  orders = []; 
  saveAll(); 
  res.json({ message: "All orders cleared" });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
