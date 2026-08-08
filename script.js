/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectedProductsCount = document.getElementById("selectedProductsCount");
const clearSelectionsButton = document.getElementById("clearSelections");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

/* The class-hosted Cloudflare Worker handles the OpenAI request */
const workerUrl = "https://loreal-routine.your-subdomain.workers.dev/";

/* Save the selected products between page reloads */
const selectedProductsStorageKey = "loreal-selected-products";

/* Escape text before placing it into the chat window */
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* Show a response inside the chat window as a readable assistant message */
function renderChatResponse(title, message) {
  chatWindow.innerHTML = `
    <article class="chat-message assistant-message">
      <h3>${title}</h3>
      <div class="chat-message-body">${escapeHtml(message).replaceAll(
        "\n",
        "<br />",
      )}</div>
    </article>
  `;
}

/* Add a chat message to the window */
function appendChatMessage(role, title, message) {
  const article = document.createElement("article");
  article.className = `chat-message ${role}-message`;

  const heading = document.createElement("h3");
  heading.textContent = title;

  const body = document.createElement("div");
  body.className = "chat-message-body";
  body.innerHTML = escapeHtml(message).replaceAll("\n", "<br />");

  article.appendChild(heading);
  article.appendChild(body);
  chatWindow.appendChild(article);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Keep the current conversation with the AI */
let routineMessages = [];

/* Build the selected-products context for the worker */
function buildSelectedProductsContext(selectedList) {
  return {
    role: "user",
    content: `These are the selected products. Use only this JSON as product context and keep the routine grounded in these items:\n\n${JSON.stringify(
      selectedList,
      null,
      2,
    )}`,
  };
}

/* Keep the chat focused on the generated routine and related beauty topics */
function buildSystemMessage() {
  return {
    role: "system",
    content:
      "You are a helpful L'Oréal skincare, haircare, makeup, and fragrance advisor. Answer only questions about the generated routine or related beauty topics. Use the full conversation history to stay consistent. If the user asks something unrelated, politely redirect them back to their routine or a related beauty topic. Build routines using only the selected products the user provides.",
  };
}

/* Send the full conversation to the worker and display the reply */
async function requestRoutineReply(userMessage) {
  const selectedList = Array.from(selectedProducts.values()).map((product) => ({
    id: product.id,
    brand: product.brand,
    name: product.name,
    category: product.category,
    description: product.description,
  }));

  if (selectedList.length === 0) {
    appendChatMessage(
      "assistant",
      "No Products Selected",
      "Please select at least one product first.",
    );
    return;
  }

  const userPrompt =
    userMessage ||
    "Generate a personalized routine using only the selected products above. Do not add products that are not listed.";

  if (!userMessage) {
    appendChatMessage(
      "assistant",
      "Generating Your Routine",
      "Generating your personalized routine...",
    );
  } else {
    appendChatMessage("user", "You", userMessage);
  }

  generateRoutineButton.disabled = true;

  const messages = [
    buildSystemMessage(),
    buildSelectedProductsContext(selectedList),
    ...routineMessages,
    { role: "user", content: userPrompt },
  ];

  try {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      appendChatMessage(
        "assistant",
        "No Routine Returned",
        "No routine was returned. Please try again.",
      );
      return;
    }

    routineMessages.push({ role: "user", content: userPrompt });
    routineMessages.push({ role: "assistant", content: reply });

    appendChatMessage("assistant", "Your Personalized Routine", reply);
  } catch (error) {
    appendChatMessage(
      "assistant",
      "Generation Error",
      "There was a problem generating the routine.",
    );
  } finally {
    generateRoutineButton.disabled = selectedProducts.size === 0;
  }
}

/* Keep track of the products that are currently selected */
const selectedProducts = new Map();
const expandedProducts = new Set();
let currentProducts = [];

/* Load selected products from localStorage if the browser has them saved */
function loadSelectedProducts() {
  const savedProducts = localStorage.getItem(selectedProductsStorageKey);

  if (!savedProducts) {
    return;
  }

  try {
    const parsedProducts = JSON.parse(savedProducts);

    parsedProducts.forEach((product) => {
      selectedProducts.set(product.id, product);
    });
  } catch (error) {
    localStorage.removeItem(selectedProductsStorageKey);
  }
}

/* Save the current selected products to localStorage */
function saveSelectedProducts() {
  localStorage.setItem(
    selectedProductsStorageKey,
    JSON.stringify(Array.from(selectedProducts.values())),
  );
}

loadSelectedProducts();

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Update the selected products section */
function renderSelectedProducts() {
  const selectedList = Array.from(selectedProducts.values());
  const selectedCount = selectedList.length;

  selectedProductsCount.textContent =
    selectedCount === 1 ? "1 selected" : `${selectedCount} selected`;
  generateRoutineButton.disabled = selectedCount === 0;

  if (selectedCount === 0) {
    selectedProductsList.innerHTML = "<p>No products selected yet.</p>";
    saveSelectedProducts();
    return;
  }

  selectedProductsList.innerHTML = selectedList
    .map(
      (product) => `
        <div class="selected-product-chip">
          <span class="selected-product-chip-label">${product.brand} - ${product.name}</span>
          <button
            type="button"
            class="selected-product-remove"
            data-product-id="${product.id}"
            aria-label="Remove ${product.brand} ${product.name}"
          >
            ×
          </button>
        </div>
      `,
    )
    .join("");

  saveSelectedProducts();
}

renderSelectedProducts();

/* Remove a product from the selected list */
function removeProduct(productId) {
  if (!selectedProducts.has(productId)) {
    return;
  }

  selectedProducts.delete(productId);
  saveSelectedProducts();
  displayProducts(currentProducts);
  renderSelectedProducts();
}

/* Remove all selected products at once */
function clearSelectedProducts() {
  selectedProducts.clear();
  expandedProducts.clear();
  saveSelectedProducts();
  displayProducts(currentProducts);
  renderSelectedProducts();
}

/* Toggle a product on or off when the card is clicked */
function toggleProduct(productId) {
  const product = currentProducts.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  if (selectedProducts.has(productId)) {
    selectedProducts.delete(productId);
  } else {
    selectedProducts.set(productId, product);
  }

  saveSelectedProducts();
  displayProducts(currentProducts);
  renderSelectedProducts();
}

/* Reveal or hide the description for a product card */
function toggleProductDescription(productId) {
  if (expandedProducts.has(productId)) {
    expandedProducts.delete(productId);
  } else {
    expandedProducts.add(productId);
  }

  displayProducts(currentProducts);
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  currentProducts = products;

  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card ${
      selectedProducts.has(product.id) ? "is-selected" : ""
    } ${expandedProducts.has(product.id) ? "is-expanded" : ""}" data-product-id="${product.id}" role="button" tabindex="0" aria-pressed="${selectedProducts.has(
      product.id,
    )}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <button
          type="button"
          class="product-details-toggle"
          data-product-id="${product.id}"
          aria-expanded="${expandedProducts.has(product.id)}"
          aria-controls="product-desc-${product.id}"
        >
          ${expandedProducts.has(product.id) ? "Hide description" : "View description"}
        </button>
        <p id="product-desc-${product.id}" class="product-description">
          ${product.description}
        </p>
      </div>
    </div>
  `,
    )
    .join("");
}

/* Allow users to select or unselect a product by clicking its card */
productsContainer.addEventListener("click", (e) => {
  const detailsButton = e.target.closest(".product-details-toggle");

  if (detailsButton) {
    toggleProductDescription(Number(detailsButton.dataset.productId));
    return;
  }

  const card = e.target.closest(".product-card");

  if (!card) {
    return;
  }

  toggleProduct(Number(card.dataset.productId));
});

/* Support keyboard selection for the same card interaction */
productsContainer.addEventListener("keydown", (e) => {
  if (e.target.closest(".product-details-toggle")) {
    return;
  }

  if (e.key !== "Enter" && e.key !== " ") {
    return;
  }

  const card = e.target.closest(".product-card");

  if (!card) {
    return;
  }

  e.preventDefault();
  toggleProduct(Number(card.dataset.productId));
});

/* Allow users to remove an item directly from the selected list */
selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".selected-product-remove");

  if (!removeButton) {
    return;
  }

  removeProduct(Number(removeButton.dataset.productId));
});

/* Allow users to clear the entire saved selection at once */
clearSelectionsButton.addEventListener("click", () => {
  clearSelectedProducts();
});

/* Build a routine from only the products the user selected */
generateRoutineButton.addEventListener("click", async () => {
  await requestRoutineReply("");
});

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory,
  );

  displayProducts(filteredProducts);
});

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const followUp = userInput.value.trim();

  if (!followUp) {
    return;
  }

  userInput.value = "";
  await requestRoutineReply(followUp);
});
