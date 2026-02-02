/**
 * Sella El Techo - Quote Calculator
 * Precio base: $3.50 por pie cuadrado
 */

const PRICE_PER_SQUARE_FOOT = 3.50;

// DOM Elements
const squareFeetInput = document.getElementById('squareFeet');
const displaySqFt = document.getElementById('displaySqFt');
const basePriceEl = document.getElementById('basePrice');
const addonsBreakdown = document.getElementById('addonsBreakdown');
const addonsTotalEl = document.getElementById('addonsTotal');
const totalPriceEl = document.getElementById('totalPrice');

// All addon checkboxes
const addonCheckboxes = document.querySelectorAll('.addon-item input[type="checkbox"]');

/**
 * Format a number as currency (USD)
 */
function formatCurrency(amount) {
    return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Calculate the base price based on square feet
 */
function calculateBasePrice(squareFeet) {
    return squareFeet * PRICE_PER_SQUARE_FOOT;
}

/**
 * Get all selected addons with their details
 */
function getSelectedAddons() {
    const selected = [];

    addonCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
            const label = checkbox.closest('label');
            const name = label.querySelector('.addon-name').textContent;
            const price = parseFloat(checkbox.dataset.price) || 0;

            selected.push({ name, price });
        }
    });

    return selected;
}

/**
 * Calculate total addons price
 */
function calculateAddonsTotal(addons) {
    return addons.reduce((total, addon) => total + addon.price, 0);
}

/**
 * Update the quote display
 */
function updateQuote() {
    // Get square feet value
    const squareFeet = parseFloat(squareFeetInput.value) || 0;

    // Calculate base price
    const basePrice = calculateBasePrice(squareFeet);

    // Get selected addons
    const selectedAddons = getSelectedAddons();
    const addonsTotal = calculateAddonsTotal(selectedAddons);

    // Calculate total
    const total = basePrice + addonsTotal;

    // Update display - Square feet
    displaySqFt.textContent = squareFeet.toLocaleString();

    // Update display - Base price
    basePriceEl.textContent = formatCurrency(basePrice);

    // Update display - Addons breakdown
    if (selectedAddons.length > 0) {
        addonsBreakdown.innerHTML = selectedAddons.map(addon =>
            `<div class="addons-breakdown-item">
                <span>${addon.name}</span>
                <span>${formatCurrency(addon.price)}</span>
            </div>`
        ).join('');
    } else {
        addonsBreakdown.innerHTML = '<div class="addons-breakdown-item"><span>No hay servicios adicionales seleccionados</span></div>';
    }

    // Update display - Addons total
    addonsTotalEl.textContent = formatCurrency(addonsTotal);

    // Update display - Total
    totalPriceEl.textContent = formatCurrency(total);
}

// Event Listeners
squareFeetInput.addEventListener('input', updateQuote);

addonCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', updateQuote);
});

// Initialize quote on page load
document.addEventListener('DOMContentLoaded', updateQuote);

// Also run immediately in case DOM is already loaded
updateQuote();
