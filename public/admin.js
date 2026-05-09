let token = "";

async function login() {
  const userField = document.getElementById('username');
  const passField = document.getElementById('password');
  
  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userField.value, password: passField.value })
    });
    const data = await res.json();

    if (data.token) {
      token = data.token;
      localStorage.setItem("token", token);
      setupDashboard();
    } else {
      alert("Error: " + (data.error || "Invalid credentials"));
    }
  } catch (err) { alert("Server connection failed."); }
}

function setupDashboard() {
  document.getElementById('loginBox').classList.add('hidden');
  document.getElementById('panel').classList.remove('hidden');
  loadAllData();
  loadCurrentHours();
}

window.onload = () => {
  const saved = localStorage.getItem("token");
  if (saved) {
    token = saved;
    setupDashboard();
  }
};

function loadAllData() {
  checkStoreStatus();
  loadProducts();
  loadOrders();
  loadBannedIPs();
}

async function loadCurrentHours() {
  try {
    const res = await fetch('/store-status');
    const data = await res.json();
    if (data.open !== undefined) {
      document.getElementById('openTimeInput').value = data.open;
      document.getElementById('closeTimeInput').value = data.close;
    }
  } catch(e) {}
}

async function updateStoreHours() {
  const open = document.getElementById('openTimeInput').value;
  const close = document.getElementById('closeTimeInput').value;

  if (open === "" || close === "") return alert("Please enter both times.");

  const res = await fetch('/update-hours', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': token 
    },
    body: JSON.stringify({ open: Number(open), close: Number(close) })
  });

  if (res.ok) {
    alert("Operating hours updated successfully!");
    checkStoreStatus(); 
  } else {
    alert("Failed to update hours.");
  }
}

async function checkStoreStatus() {
  try {
    const res = await fetch('/store-status');
    const data = await res.json();
    const banner = document.getElementById('storeStatusContainer');
    
    if (data.isOpen) {
      banner.className = "status-banner status-open";
      banner.innerText = `● STORE IS OPEN (Serving until ${data.close}:00)`;
    } else {
      banner.className = "status-banner status-closed";
      banner.innerText = `○ STORE IS CLOSED (Opens at ${data.open}:00)`;
    }
  } catch(e){}
}

async function loadProducts() {
  try {
    const res = await fetch('/products');
    const data = await res.json();
    const container = document.getElementById('products');
    container.innerHTML = '';

    data.forEach(p => {
      container.innerHTML += `
        <div class="card product-edit-card">
          <div class="sales-badge">Sales: ${p.salesCount || 0}</div>
          <img src="${p.img}">
          <label>Product Name</label>
          <input id="name-${p.id}" value="${p.name}">
          <div style="display:flex; gap:10px;">
            <div style="flex:1"><label>Price</label><input id="price-${p.id}" type="number" value="${p.price}"></div>
            <div style="flex:1"><label>Stock</label><input id="stock-${p.id}" type="number" value="${p.stock}"></div>
          </div>
          <label>Image URL</label>
          <input id="img-${p.id}" value="${p.img}" placeholder="Image URL">
          <div style="display:flex; gap:10px; margin-top:10px;">
            <button onclick="updateProduct(${p.id})" style="flex:2;">Update</button>
            <button onclick="deleteProduct(${p.id})" class="btn-danger" style="flex:1;">Delete</button>
          </div>
        </div>
      `;
    });
  } catch(e){}
}

async function loadOrders() {
  try {
    if (!token) return;
    const res = await fetch('/orders', { headers: { 'Authorization': token } });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("token");
      location.reload();
      return;
    }

    const data = await res.json();
    const container = document.getElementById('orders');
    container.innerHTML = '';

    if (data.length === 0) {
      container.innerHTML = '<p style="color:gray; text-align:center;">No active orders.</p>';
      return;
    }

    data.reverse().forEach(o => {
      const div = document.createElement('div');
      div.className = 'card';
      const statusColor = o.status === 'Completed' ? '#4CAF50' : o.status === 'On Delivery' ? '#2196F3' : '#ff5722';
      
      div.innerHTML = `
        <div style="border-left: 6px solid ${statusColor}; padding-left: 15px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
            <strong>Order ID: #${o.id.toString().slice(-6)}</strong>
            <span style="font-size:12px; color:gray;">${new Date(o.date).toLocaleTimeString()}</span>
          </div>
          <p style="margin:8px 0;"><strong>Customer:</strong> ${o.name} <span style="font-size:11px; background:#eee; padding:2px 5px; border-radius:4px;">IP: ${o.ip}</span></p>
          <p style="margin:5px 0;"><strong>Location:</strong> ${o.address}</p>
          <p style="margin:5px 0; color:var(--primary); font-weight:bold;">Items: ${o.cart.map(i => `${i.name} (x${i.qty})`).join(', ')}</p>
          <p><strong>Total: ₱${o.total}</strong></p>
          <hr style="border:0; border-top:1px solid #eee;">
          <div style="display:flex; justify-content: space-between; align-items: center; flex-wrap:wrap; gap:10px;">
            <div style="flex:1;">
              <select onchange="updateStatus(${o.id}, this.value)" style="margin:0; min-width:150px;">
                <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Grilling" ${o.status === 'Grilling' ? 'selected' : ''}>Grilling 🔥</option>
                <option value="On Delivery" ${o.status === 'On Delivery' ? 'selected' : ''}>On Delivery 🚚</option>
                <option value="Completed" ${o.status === 'Completed' ? 'selected' : ''}>Completed ✅</option>
              </select>
            </div>
            <button onclick="blockIP('${o.ip}', '${o.name}')" class="btn-danger" style="font-size:12px; padding:8px 15px;">Block User</button>
          </div>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (err) { console.error("Order Sync Error:", err); }
}

async function updateProduct(id) {
  await fetch(`/update-product/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({
      name: document.getElementById(`name-${id}`).value,
      price: Number(document.getElementById(`price-${id}`).value),
      stock: Number(document.getElementById(`stock-${id}`).value),
      img: document.getElementById(`img-${id}`).value
    })
  });
  alert("Product Updated");
  loadProducts();
}

async function addProduct() {
  const body = {
    name: document.getElementById('new-name').value,
    price: Number(document.getElementById('new-price').value),
    stock: Number(document.getElementById('new-stock').value),
    img: document.getElementById('new-img').value
  };
  if(!body.name || !body.price) return alert("Fill required fields");

  const res = await fetch('/add-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify(body)
  });
  if (res.ok) { 
    alert("Added!"); 
    loadProducts();
    document.getElementById('new-name').value = '';
    document.getElementById('new-price').value = '';
    document.getElementById('new-stock').value = '';
  }
}

async function updateStatus(id, status) {
  await fetch(`/order-status/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ status })
  });
}

async function deleteProduct(id) {
  if(!confirm("Delete this product?")) return;
  await fetch(`/delete-product/${id}`, { method: 'DELETE', headers: { 'Authorization': token } });
  loadProducts();
}

async function clearOrders() {
  if (!confirm("Delete all order history permanently?")) return;
  const res = await fetch('/clear-orders', { method: 'DELETE', headers: { 'Authorization': token } });
  if (res.ok) loadOrders();
}

async function blockIP(ip, name) {
  if (!confirm(`Are you sure you want to block ${name} (${ip})?`)) return;
  const res = await fetch('/block-ip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ ip, name })
  });
  if (res.ok) { loadOrders(); loadBannedIPs(); }
}

async function loadBannedIPs() {
  try {
    const res = await fetch('/banned-ips', { headers: { 'Authorization': token } });
    const list = await res.json();
    const container = document.getElementById('bannedList');
    if(list.length === 0) {
      container.innerHTML = '<p style="color:gray; font-size:14px;">No users currently blocked.</p>';
      return;
    }
    container.innerHTML = list.map(user => `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:#f9f9f9; padding:10px; border-radius:6px; border:1px solid #eee;">
        <span><strong>${user.name}</strong> <small style="color:gray;">(${user.ip})</small></span>
        <button onclick="unblockIP('${user.ip}')" class="btn-success" style="padding:5px 10px; font-size:12px;">Unblock</button>
      </div>
    `).join('');
  } catch(e){}
}

async function unblockIP(ip) {
  await fetch('/unblock-ip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ ip })
  });
  loadBannedIPs();
}

// SYNC INTERVALS
setInterval(() => { if(token) loadOrders(); }, 5000); 
setInterval(() => { if(token) checkStoreStatus(); }, 60000); 
