/* NEVER TOLD — shared cart (nt-cart-v1)
   Cart lives in localStorage under "nt_cart".
   Item shape: {slug, name, price_cents, image, size, color, qty}
   Checkout is created by the NEVER TOLD checkout worker (Cloudflare),
   which re-validates every price against its own catalog. No keys here. */
"use strict";

/* === CONFIG: set this to the real worker URL after deployment ===
   Deploy steps: ~/workspace/clothing-brand/checkout-worker/README.md */
const NT_CHECKOUT_ENDPOINT = "https://nevertold-checkout.example.workers.dev/checkout";

const NT_CART_KEY = "nt_cart";
const NT_SIZES = ["S", "M", "L", "XL", "2XL"];
const NT_SHIPPING = {
  special: { key: "special", cents: 500,  label: "Special Line — $5 — 10d avg; 95% in 15d" },
  pro:     { key: "pro",     cents: 1000, label: "Special Line Pro — $10 — 7d avg; 95% in 10d" },
  express: { key: "express", cents: 1500, label: "International Express — $15 — 5d avg; 95% in 7d" }
};

/* ---------------- cart store (pure logic) ---------------- */

function ntLoadCart() {
  try {
    const raw = localStorage.getItem(NT_CART_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch (e) { return []; }
}

function ntSaveCart(items) {
  try { localStorage.setItem(NT_CART_KEY, JSON.stringify(items)); } catch (e) {}
  ntUpdateNavCount();
}

function ntItemKey(it) {
  return [it.slug, it.size || "", it.color || ""].join("|");
}

function addToCart(item) {
  const items = ntLoadCart();
  const key = ntItemKey(item);
  const found = items.find(function (i) { return ntItemKey(i) === key; });
  if (found) { found.qty = Math.min(99, found.qty + (item.qty || 1)); }
  else {
    items.push({
      slug: item.slug, name: item.name, price_cents: item.price_cents,
      image: item.image || "", size: item.size || null, color: item.color || null,
      qty: item.qty || 1
    });
  }
  ntSaveCart(items);
  return items;
}

function changeQty(key, delta) {
  const items = ntLoadCart();
  const it = items.find(function (i) { return ntItemKey(i) === key; });
  if (it) {
    it.qty += delta;
    if (it.qty <= 0) { return removeItem(key); }
    if (it.qty > 99) { it.qty = 99; }
    ntSaveCart(items);
  }
  return items;
}

function setQty(key, qty) {
  const items = ntLoadCart();
  const it = items.find(function (i) { return ntItemKey(i) === key; });
  if (it) {
    it.qty = Math.max(0, Math.min(99, qty | 0));
    if (it.qty === 0) { return removeItem(key); }
    ntSaveCart(items);
  }
  return items;
}

function removeItem(key) {
  const items = ntLoadCart().filter(function (i) { return ntItemKey(i) !== key; });
  ntSaveCart(items);
  return items;
}

function cartCount() {
  return ntLoadCart().reduce(function (n, i) { return n + i.qty; }, 0);
}

function subtotalCents() {
  return ntLoadCart().reduce(function (n, i) { return n + i.price_cents * i.qty; }, 0);
}

function ntMoney(cents) {
  return "$" + (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/* Buy Now keeps today's single-item behavior: go straight to the
   product's existing Stripe payment link. */
function buyNow(url) {
  if (url && url !== "#") { window.location.href = url; }
}

/* ---------------- checkout ---------------- */

function ntCheckout(shippingKey) {
  const items = ntLoadCart().map(function (i) {
    return { slug: i.slug, size: i.size, color: i.color, qty: i.qty };
  });
  const msg = document.getElementById("nt-checkout-msg");
  function fail() {
    if (msg) {
      msg.textContent = "Checkout is opening soon — please use Buy Now on a product page for now.";
      msg.style.display = "block";
    }
  }
  if (!items.length) { return Promise.resolve(false); }
  if (!NT_CHECKOUT_ENDPOINT || NT_CHECKOUT_ENDPOINT.indexOf("example.workers.dev") !== -1) {
    fail();
    return Promise.resolve(false);
  }
  return fetch(NT_CHECKOUT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: items, shipping: shippingKey || "special" })
  }).then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.url) { window.location.href = data.url; return true; }
      fail(); return false;
    })
    .catch(function () { fail(); return false; });
}

/* ---------------- shared UI ---------------- */

const NT_CART_CSS = [
  ".nt-cartlink{white-space:nowrap}",
  ".nt-buybox{margin:26px 0 6px}",
  ".nt-qtylabel{color:#666;font-size:11px;letter-spacing:.2em;text-transform:uppercase;margin:0 0 10px}",
  ".nt-qtyrow{display:flex;align-items:center;gap:14px;flex-wrap:wrap}",
  ".nt-qty{display:inline-flex;align-items:center;border:1px solid #000}",
  ".nt-qty button{background:#fff;color:#000;border:none;width:42px;height:42px;font-size:20px;cursor:pointer;line-height:1}",
  ".nt-qty button:hover{background:#000;color:#fff}",
  ".nt-qty .nt-qty-n{min-width:34px;text-align:center;font-size:16px}",
  ".nt-addbtn{background:#000;color:#fff;border:1px solid #000;border-radius:0;letter-spacing:.14em;text-transform:uppercase;padding:13px 34px;font-size:12px;cursor:pointer}",
  ".nt-addbtn:hover{background:#fff;color:#000}",
  ".nt-added{color:#000;font-size:13px;letter-spacing:.06em;display:none}",
  ".nt-added a{text-decoration:underline}",
  ".nt-picksize{color:#b00020;font-size:13px;letter-spacing:.06em;display:none;margin-top:10px}",
  ".nt-cartrow{display:flex;gap:20px;align-items:center;border-bottom:1px solid #e5e5e5;padding:20px 0;flex-wrap:wrap}",
  ".nt-cartrow img{width:96px;height:96px;object-fit:contain;background:#fff}",
  ".nt-cartrow .nt-ci{flex:1;min-width:180px}",
  ".nt-cartrow .nt-cname{font-size:17px}",
  ".nt-cartrow .nt-cvar{color:#666;font-size:13px;letter-spacing:.06em;margin-top:3px}",
  ".nt-cartrow .nt-cunit{color:#666;font-size:13px;margin-top:3px}",
  ".nt-cartrow .nt-cline{font-size:16px;min-width:70px;text-align:right}",
  ".nt-remove{background:none;border:none;color:#666;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;text-decoration:underline;padding:0;margin-top:6px}",
  ".nt-shipopt{display:block;border:1px solid #e5e5e5;padding:14px 16px;margin:10px 0;cursor:pointer;font-size:15px}",
  ".nt-shipopt input{margin-right:10px}",
  ".nt-totrow{display:flex;justify-content:space-between;font-size:16px;padding:8px 0}",
  ".nt-totrow.nt-grand{border-top:1px solid #000;font-size:19px;padding-top:14px;margin-top:6px}",
  "#nt-checkout-msg{display:none;border:1px solid #000;padding:14px 16px;margin:16px 0;font-size:14px}"
].join("\n");

function ntInjectCSS() {
  if (document.getElementById("nt-cart-css")) { return; }
  const st = document.createElement("style");
  st.id = "nt-cart-css";
  st.textContent = NT_CART_CSS;
  document.head.appendChild(st);
}

function ntUpdateNavCount() {
  const link = document.getElementById("nt-cart-link");
  if (link) { link.textContent = "Cart (" + cartCount() + ")"; }
}

function ntInjectNavLink() {
  const nav = document.querySelector(".nt-nav");
  if (!nav || document.getElementById("nt-cart-link")) { return; }
  const a = document.createElement("a");
  a.href = "/cart.html";
  a.id = "nt-cart-link";
  a.className = "nt-cartlink";
  a.textContent = "Cart (" + cartCount() + ")";
  nav.appendChild(a);
}

/* ---------------- product pages ---------------- */

function ntSelectedOpt(labelText) {
  const labels = document.querySelectorAll(".opt-label");
  for (let i = 0; i < labels.length; i++) {
    if (labels[i].textContent.trim().toLowerCase().indexOf(labelText) === 0) {
      const group = labels[i].nextElementSibling;
      if (group) {
        const on = group.querySelector(".opt.on");
        if (on) { return on.textContent.trim(); }
      }
      return null;
    }
  }
  return undefined; /* no such option group on this page */
}

function ntMakeQtyControl() {
  const wrap = document.createElement("span");
  wrap.className = "nt-qty";
  wrap.innerHTML = '<button type="button" class="nt-qminus" aria-label="Minus">&minus;</button>' +
    '<span class="nt-qty-n">1</span>' +
    '<button type="button" class="nt-qplus" aria-label="Plus">+</button>';
  const n = wrap.querySelector(".nt-qty-n");
  wrap.querySelector(".nt-qminus").addEventListener("click", function () {
    n.textContent = String(Math.max(1, parseInt(n.textContent, 10) - 1));
  });
  wrap.querySelector(".nt-qplus").addEventListener("click", function () {
    n.textContent = String(Math.min(99, parseInt(n.textContent, 10) + 1));
  });
  wrap.getQty = function () { return parseInt(n.textContent, 10) || 1; };
  return wrap;
}

function ntFlashAdded(el) {
  el.style.display = "inline";
  setTimeout(function () { el.style.display = "none"; }, 3500);
}

function ntInitProductPage() {
  const P = window.NT_PRODUCT;
  if (!P) { return; }
  const buyAnchor = document.querySelector(".wrap a.btn");
  if (!buyAnchor) { return; }

  const box = document.createElement("div");
  box.className = "nt-buybox";
  const qtyCtl = ntMakeQtyControl();
  box.innerHTML = '<div class="nt-qtylabel">Quantity</div>';
  const row = document.createElement("div");
  row.className = "nt-qtyrow";
  row.appendChild(qtyCtl);
  box.appendChild(row);
  const pick = document.createElement("div");
  pick.className = "nt-picksize";
  pick.textContent = "Please pick a size first.";
  box.appendChild(pick);
  buyAnchor.parentNode.insertBefore(box, buyAnchor);

  function chosenSize() {
    const s = ntSelectedOpt("size");
    return s === undefined ? null : s;
  }
  function chosenColor() {
    if (P.sweatsuit) {
      const cn = document.getElementById("ss-colorname");
      return cn ? cn.textContent.trim() : null;
    }
    const c = ntSelectedOpt("color");
    return c === undefined ? null : c;
  }
  function guardSize() {
    const s = chosenSize();
    if (!s) {
      pick.style.display = "block";
      const labels = document.querySelectorAll(".opt-label");
      for (let i = 0; i < labels.length; i++) {
        if (labels[i].textContent.trim().toLowerCase().indexOf("size") === 0) {
          labels[i].scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
      return null;
    }
    pick.style.display = "none";
    return s;
  }

  if (P.sweatsuit) {
    /* Two pieces, each with its own Add button next to its Buy anchor. */
    const pieces = [
      { key: "hoodie", anchorId: "ss-buy-hoodie", imgId: "ss-hoodie" },
      { key: "pants", anchorId: "ss-buy-pants", imgId: "ss-pants" }
    ];
    pieces.forEach(function (pc) {
      const anchor = document.getElementById(pc.anchorId);
      const data = P.pieces[pc.key];
      if (!anchor || !data) { return; }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nt-addbtn";
      btn.textContent = pc.key === "hoodie" ? "Add Hoodie to Cart" : "Add Sweatpants to Cart";
      btn.style.marginRight = "12px";
      const added = document.createElement("span");
      added.className = "nt-added";
      added.innerHTML = 'Added &mdash; <a href="/cart.html">View cart</a>';
      btn.addEventListener("click", function () {
        const size = guardSize();
        if (!size) { return; }
        const img = document.getElementById(pc.imgId);
        addToCart({
          slug: data.slug, name: data.name, price_cents: data.price_cents,
          image: img ? img.getAttribute("src") : data.image,
          size: size, color: chosenColor(), qty: qtyCtl.getQty()
        });
        ntFlashAdded(added);
      });
      anchor.parentNode.insertBefore(btn, anchor);
      anchor.parentNode.insertBefore(added, anchor);
      anchor.parentNode.insertBefore(document.createElement("br"), anchor);
    });
    return;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nt-addbtn";
  btn.textContent = "Add to Cart";
  btn.style.marginRight = "12px";
  const added = document.createElement("span");
  added.className = "nt-added";
  added.innerHTML = 'Added &mdash; <a href="/cart.html">View cart</a>';
  btn.addEventListener("click", function () {
    const size = chosenSize();
    if (size === null && ntSelectedOpt("size") === null) {
      /* page has a size group but nothing picked */
      guardSize();
      return;
    }
    addToCart({
      slug: P.slug, name: P.name, price_cents: P.price_cents, image: P.image,
      size: size, color: chosenColor(), qty: qtyCtl.getQty()
    });
    ntFlashAdded(added);
  });
  buyAnchor.parentNode.insertBefore(btn, buyAnchor);
  buyAnchor.parentNode.insertBefore(added, buyAnchor);
}

/* ---------------- cart page ---------------- */

function ntInitCartPage() {
  const listEl = document.getElementById("nt-cart-items");
  if (!listEl) { return; }
  const emptyEl = document.getElementById("nt-cart-empty");
  const summaryEl = document.getElementById("nt-cart-summary");

  function currentShipping() {
    const r = document.querySelector('input[name="nt-ship"]:checked');
    return r ? r.value : "special";
  }

  function render() {
    const items = ntLoadCart();
    listEl.innerHTML = "";
    if (!items.length) {
      if (emptyEl) { emptyEl.style.display = "block"; }
      if (summaryEl) { summaryEl.style.display = "none"; }
      return;
    }
    if (emptyEl) { emptyEl.style.display = "none"; }
    if (summaryEl) { summaryEl.style.display = "block"; }
    items.forEach(function (it) {
      const key = ntItemKey(it);
      const row = document.createElement("div");
      row.className = "nt-cartrow";
      const vars = [];
      if (it.size) { vars.push("Size " + it.size); }
      if (it.color) { vars.push(it.color); }
      row.innerHTML =
        (it.image ? '<img src="' + it.image + '" alt="">' : "") +
        '<div class="nt-ci"><div class="nt-cname"></div>' +
        (vars.length ? '<div class="nt-cvar">' + vars.join(" · ") + "</div>" : "") +
        '<div class="nt-cunit">' + ntMoney(it.price_cents) + " each</div>" +
        '<button type="button" class="nt-remove">Remove</button></div>';
      row.querySelector(".nt-cname").textContent = it.name;
      const qtyCtl = document.createElement("span");
      qtyCtl.className = "nt-qty";
      qtyCtl.innerHTML = '<button type="button" aria-label="Minus">&minus;</button>' +
        '<span class="nt-qty-n">' + it.qty + '</span>' +
        '<button type="button" aria-label="Plus">+</button>';
      const btns = qtyCtl.querySelectorAll("button");
      btns[0].addEventListener("click", function () { changeQty(key, -1); render(); });
      btns[1].addEventListener("click", function () { changeQty(key, 1); render(); });
      row.appendChild(qtyCtl);
      const line = document.createElement("div");
      line.className = "nt-cline";
      line.textContent = ntMoney(it.price_cents * it.qty);
      row.appendChild(line);
      row.querySelector(".nt-remove").addEventListener("click", function () {
        removeItem(key); render();
      });
      listEl.appendChild(row);
    });
    const sub = subtotalCents();
    const ship = NT_SHIPPING[currentShipping()] || NT_SHIPPING.special;
    document.getElementById("nt-subtotal").textContent = ntMoney(sub);
    document.getElementById("nt-shipcost").textContent = ntMoney(ship.cents);
    document.getElementById("nt-total").textContent = ntMoney(sub + ship.cents);
  }

  document.querySelectorAll('input[name="nt-ship"]').forEach(function (r) {
    r.addEventListener("change", render);
  });
  const co = document.getElementById("nt-checkout");
  if (co) {
    co.addEventListener("click", function () { ntCheckout(currentShipping()); });
  }
  render();
}

/* ---------------- boot ---------------- */

function ntInit() {
  ntInjectCSS();
  ntInjectNavLink();
  ntUpdateNavCount();
  ntInitProductPage();
  ntInitCartPage();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ntInit);
  } else { ntInit(); }
}

/* Exported for reuse/testing */
const NTCart = {
  addToCart: addToCart, buyNow: buyNow, changeQty: changeQty, setQty: setQty,
  removeItem: removeItem, cartCount: cartCount, subtotalCents: subtotalCents,
  checkout: ntCheckout, load: ntLoadCart, ENDPOINT: NT_CHECKOUT_ENDPOINT,
  SHIPPING: NT_SHIPPING
};
if (typeof window !== "undefined") { window.NTCart = NTCart; }
if (typeof module !== "undefined" && module.exports) { module.exports = NTCart; }
