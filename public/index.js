let cart = [], allProducts = [], savedAddresses = JSON.parse(localStorage.getItem('userAddresses')) || [];
let selectedAddressIndex = -1, lastStatuses = {}, activeRateId = null, currentRate = 0;
let lastKnownStatuses = {}; 

window.onload = () => { 
  loadProducts(); 
  checkStoreStatus(); 
  if(localStorage.getItem('customerName')) loadUserActivity();
  
  if (Notification.permission !== "granted") {
    Notification.requestPermission();
  }
};

async function checkStoreStatus() {
  try {
    // Unique query parameter forces the browser to pull live data instead of using cache
    const res = await fetch(`/store-status?t=${Date.now()}`);
    const data = await res.json();
    const msg = document.getElementById('closedMsg');
    if (!data.isOpen) {
      msg.classList.remove('hidden'); 
      msg.innerHTML = `🕒 Store Closed. Reopening at ${data.open}:00`;
      document.getElementById('checkoutBtn').disabled = true;
    } else { 
      msg.classList.add('hidden'); 
      document.getElementById('checkoutBtn').disabled = false; 
    }
  } catch(e){}
}

function sendLiveNotification(orderId, newStatus) {
    if (Notification.permission === "granted") {
        new Notification("♨️ BBQ Shop Update", {
            body: `Order #${orderId.toString().slice(-4)} is now: ${newStatus}!`,
            icon: "/favicon.ico" 
        });
    }
}

async function loadUserActivity() {
    const name = localStorage.getItem('customerName');
    if (!name) return;

    const container = document.getElementById('recentOrdersList');
    // Visual feedback that refresh is happening
    const originalContent = container.innerHTML;
    container.style.opacity = "0.5";

    try {
        const res = await fetch(`/my-orders/${name}?t=${Date.now()}`);
        const orders = await res.json();
        
        container.innerHTML = orders.reverse().map(o => {
            const statusClass = (o.status || 'Pending').toLowerCase().replace(" ", "-");
            // Replace the card template in your loadUserActivity() with this:
return `
<div class="order-card" id="order-card-${o.id}">
  <div style="display:flex; justify-content:space-between; align-items:start;">
    <strong>Order #${o.id.toString().slice(-4)}</strong>
    
    <span id="status-badge-${o.id}" class="status-badge status-${statusClass}">
      ${o.status || 'Pending'}
    </span>
  </div>
  <p style="font-size:13px; color:#666; margin:10px 0;">${o.cart.map(i => `${i.name} (x${i.qty})`).join(', ')}</p>
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <strong>₱${o.total}</strong>
    <div id="action-buttons-${o.id}">
      ${o.status === 'Completed' ? `
        ${!o.rated ? `<button onclick="openRate('${o.id}')" style="background:var(--success); color:white; border:none; padding:6px 12px; border-radius:8px; font-size:11px; cursor:pointer;">Rate</button>` : ''}
        <button onclick="reorder('${o.id}')" style="background:none; border:1px solid var(--secondary); color:var(--secondary); padding:6px 12px; border-radius:8px; font-size:11px; cursor:pointer;">Reorder</button>
      ` : ''}
    </div>
  </div>
</div>`;
        }).join('') || '<p style="text-align:center; padding:20px; color:gray;">No recent orders.</p>';
    } catch (err) {
        console.error("Refresh failed");
    } finally {
        container.style.opacity = "1";
    }
}

function showPage(p) {
  document.getElementById('shopPage').classList.toggle('hidden', p !== 'shop');
  document.getElementById('activityPage').classList.toggle('hidden', p !== 'activity');
  document.getElementById('navHome').classList.toggle('active', p === 'shop');
  document.getElementById('navActivity').classList.toggle('active', p === 'activity');
  if (p === 'activity') loadUserActivity();
}

async function reorder(orderId) {
    try {
        const name = localStorage.getItem('customerName');
        const res = await fetch(`/my-orders/${name}?t=${Date.now()}`);
        const orders = await res.json();
        const oldOrder = orders.find(o => o.id == orderId);
        if (oldOrder) {
            cart = [...oldOrder.cart];
            renderCart();
            toggleCart();
        }
    } catch(e) { alert("Could not reorder"); }
}

function openRate(id) { 
    activeRateId = id; currentRate = 0; setRate(0); 
    document.getElementById('rateComment').value = "";
    document.getElementById('ratingModal').classList.remove('hidden'); 
}

function setRate(v) { 
    currentRate = v; 
    document.querySelectorAll('#starInput span').forEach((s,i) => s.style.filter = i < v ? 'none' : 'grayscale(1)'); 
}

function closeRating() { document.getElementById('ratingModal').classList.add('hidden'); }

async function submitReview() {
  if(!currentRate) return alert("Select stars");
  const comment = document.getElementById('rateComment').value;
  try {
      const res = await fetch('/rate-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: activeRateId, rating: currentRate, comment })
      });
      if(res.ok) { alert("Thank you!"); closeRating(); loadUserActivity(); }
  } catch(e) { closeRating(); loadUserActivity(); }
}

async function loadProducts() {
  try {
    const res = await fetch(`/products?t=${Date.now()}`);
    allProducts = await res.json();
    renderProducts(allProducts);
  } catch(e) {}
}

function renderProducts(list) {
  const max = Math.max(...allProducts.map(p => p.salesCount || 0));
  
  document.getElementById('products').innerHTML = list.map(p => {
    const isOutOfStock = p.stock <= 0;
    const isBestSeller = p.salesCount === max && max > 0;

    return `
    <div class="card ${isOutOfStock ? 'out-of-stock-card' : ''}">
      ${isOutOfStock ? '<div class="sold-out-overlay">Sold Out</div>' : ''}
      
      ${isBestSeller && !isOutOfStock ? '<div class="best-seller-badge" style="position:absolute; top:5px; left:5px; background:var(--secondary); color:white; font-size:10px; padding:3px 8px; border-radius:10px; font-weight:bold; z-index:2;">🔥 BEST SELLER</div>' : ''}
      
      <img src="${p.img}" onerror="this.src='https://via.placeholder.com/150?text=BBQ'">
      
      <div class="card-body">
        <h3>${p.name}</h3>
        <p>₱${p.price}</p>
        
        <div style="margin-bottom: 10px;">
            ${isOutOfStock 
                ? '<span style="color:#ff1744; font-size:12px; font-weight:bold;">Temporarily Unavailable</span>' 
                : `<span style="color:#4CAF50; font-size:12px;">In Stock: <strong>${p.stock}</strong></span>`
            }
        </div>

        <button 
            onclick="addToCart(${p.id})" 
            ${isOutOfStock ? 'disabled' : ''}>
            ${isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </div>`;
  }).join('');
}


function addToCart(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const item = cart.find(x => x.id === id);
  if (item) item.qty++; else cart.push({ ...p, qty: 1 });
  renderCart(); 
  document.getElementById('cartPanel').classList.add('active');
}

function renderCart() {
  let total = 0, count = 0;
  const cartContainer = document.getElementById('cart');
  cartContainer.innerHTML = cart.map((item, i) => {
    // Find the original product to check live stock
    const originalProduct = allProducts.find(p => p.id === item.id);
    const hasNoMoreStock = item.qty >= (originalProduct ? originalProduct.stock : 0);
    
    total += item.price * item.qty;
    count += item.qty;
    
    return `
      <div class="cart-item">
        <div style="flex:1;">
          <strong style="font-size:14px;">${item.name}</strong>
          <p style="margin:0; font-size:12px; color:var(--muted);">₱${item.price}</p>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button class="qty-btn" onclick="updateQty(${i},-1)">-</button>
          <span style="font-weight:bold; min-width:20px; text-align:center;">${item.qty}</span>
          <button 
            class="qty-btn" 
            onclick="updateQty(${i},1)" 
            ${hasNoMoreStock ? 'disabled style="color:#ccc; cursor:not-allowed;"' : ''}>+</button>
          <button class="remove-btn" onclick="removeItem(${i})">Remove</button>
        </div>
      </div>`;
  }).join('') || '<p style="text-align:center; color:gray; padding:20px;">Your cart is empty</p>';
  document.getElementById('total').innerText = total;
  document.getElementById('cartCount').innerText = count;
}

function updateQty(i, v) {
  const item = cart[i];
  const product = allProducts.find(p => p.id === item.id);
  
  if (v > 0 && item.qty >= product.stock) {
    alert("No more stock available!");
    return;
  }
  
  cart[i].qty += v;
  if (cart[i].qty <= 0) cart.splice(i, 1);
  renderCart();
}

function removeItem(i) {
  cart.splice(i, 1);
  renderCart();
}

function toggleCart() {
  document.getElementById('cartPanel').classList.toggle('active');
}

function openAddressManager() { document.getElementById('addressModal').classList.add('active'); renderAddressList(); }
function closeAddressManager() { document.getElementById('addressModal').classList.remove('active'); }
function toggleAddAddressForm() { document.getElementById('addAddressForm').classList.toggle('hidden'); }

function saveNewAddress() {
  const n = document.getElementById('new_name').value;
  const s = document.getElementById('new_street').value;
  if(!n || !s) return alert("Missing fields");
  savedAddresses.push({ name: n, street: s, block: document.getElementById('new_block').value, lot: document.getElementById('new_lot').value });
  localStorage.setItem('userAddresses', JSON.stringify(savedAddresses));
  renderAddressList(); 
  document.getElementById('addAddressForm').classList.add('hidden');
  document.getElementById('new_name').value = "";
  document.getElementById('new_street').value = "";
}

function renderAddressList() {
  document.getElementById('addressList').innerHTML = savedAddresses.map((a, i) => `
    <div onclick="selectAddress(${i})" style="padding:10px; border:1px solid #eee; margin:5px 0; border-radius:8px; cursor:pointer; ${selectedAddressIndex === i ? 'border: 2px solid var(--primary); background:#fff5f2;' : ''}">
      <strong>${a.name}</strong><br><small>${a.street}</small>
    </div>`).join('') || '<p style="text-align:center; padding:10px;">No addresses saved.</p>';
}

function selectAddress(i) {
  selectedAddressIndex = i;
  document.getElementById('currentAddrName').innerText = savedAddresses[i].name;
  localStorage.setItem('customerName', savedAddresses[i].name);
  closeAddressManager();
}

async function placeOrder() {
  if (selectedAddressIndex === -1) return openAddressManager();
  if (cart.length === 0) return alert("Cart empty");
  
  const capRes = grecaptcha.getResponse();
  if(!capRes) return alert("Captcha required");

  const res = await fetch('/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...savedAddresses[selectedAddressIndex], cart, captchaToken: capRes })
  });
  
  if (res.ok) { 
    alert("Ordered!"); 
    cart = []; 
    renderCart(); 
    toggleCart(); 
    grecaptcha.reset(); 
    showPage('activity'); 
  } else {
    const err = await res.json();
    alert("Error: " + err.error);
    grecaptcha.reset(); 
  }
}

function filterProducts() {
  const q = document.getElementById('search').value.toLowerCase();
  renderProducts(allProducts.filter(p => p.name.toLowerCase().includes(q)));
}

// Store the last status of each order in memory
let orderStatusCache = {};

async function syncOrderStatus() {
    const name = localStorage.getItem('customerName');
    if (!name) return;

    try {
        // Fetch the fresh order list from server (cache-busted)
        const res = await fetch(`/my-orders/${name}?t=${Date.now()}`);
        const orders = await res.json();

        orders.forEach(o => {
            const lastKnownStatus = orderStatusCache[o.id];

            // If we already have this order on screen, and its status changed on Admin:
            if (lastKnownStatus !== undefined && lastKnownStatus !== o.status) {
                
                // 1. Find ONLY the status badge element for this specific order
                const badge = document.getElementById(`status-badge-${o.id}`);
                if (badge) {
                    // Update text
                    badge.innerText = o.status || 'Pending';
                    
                    // Update class/colors smoothly
                    const statusClass = (o.status || 'Pending').toLowerCase().replace(" ", "-");
                    badge.className = `status-badge status-${statusClass}`;
                }

                // 2. Dynamically show Rate & Reorder buttons only if status is changed to Completed
                const actionContainer = document.getElementById(`action-buttons-${o.id}`);
                if (actionContainer && o.status === 'Completed') {
                    actionContainer.innerHTML = `
                        ${!o.rated ? `<button onclick="openRate('${o.id}')" style="background:var(--success); color:white; border:none; padding:6px 12px; border-radius:8px; font-size:11px; cursor:pointer;">Rate</button>` : ''}
                        <button onclick="reorder('${o.id}')" style="background:none; border:1px solid var(--secondary); color:var(--secondary); padding:6px 12px; border-radius:8px; font-size:11px; cursor:pointer;">Reorder</button>
                    `;
                }
                
                // Optional: Fire a browser push notification
                sendLiveNotification(o.id, o.status);
            }

            // Save the current status in cache
            orderStatusCache[o.id] = o.status;
        });
    } catch (err) {
        console.error("Status sync failed in background", err);
    }
}


// FIXED: Removed strict ".hidden" class verification.
// Updates will actively poll in the background every 2 seconds.
setInterval(() => {
    loadProducts(); 
    checkStoreStatus();
}, 2000);



// Keep stocks updated and check order status changes in the background smoothly
setInterval(() => {
    syncOrderStatus();   // Checks and changes ONLY the status badges if admin updated them!
}, 3000);
