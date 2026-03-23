/*
  products.js
  Local catalog data for the ICMR - Global Centre of Excellence on Millets.

  - No backend, no login, no cart.
  - Add / replace items here.
  - Images live in the /product-images folder.
  - Set `image` like: "product-images/your-file.jpg".
*/

// Expose as a global for simple vanilla JS usage.
window.PRODUCTS = [
  {
    id: "001",
    name: "Ragi Cookies",
    image: "product-images/IMG-20260323-WA0000.jpg.jpeg",
    weight: "200g",
    category: "Cookies",
    millet_type: "Ragi",
    fpo_name: "Shree Sampoorna FPO",
    fpo_location: "Bengaluru, Karnataka",
    contact: "+919876543210",
    description:
      "Crunchy, millet-forward cookies made with ragi and natural sweeteners.",
    ingredients: "Ragi flour, jaggery, butter, cocoa, baking powder, salt",
    shelf_life: "45 days",
  },
  {
    id: "002",
    name: "Jowar Flour",
    image: "product-images/IMG-20260323-WA0001.jpg.jpeg",
    weight: "1 kg",
    category: "Flour",
    millet_type: "Jowar",
    fpo_name: "Satpura Farmers FPO",
    fpo_location: "Sehore, Madhya Pradesh",
    contact: "+919900112233",
    description: "Stone-ground jowar flour suitable for rotis and baking.",
    ingredients: "100% Jowar (Sorghum)",
    shelf_life: "6 months",
  },
  {
    id: "003",
    name: "Bajra Namkeen Mix",
    image: "product-images/IMG-20260323-WA0003.jpg.jpeg",
    weight: "250g",
    category: "Snacks",
    millet_type: "Bajra",
    fpo_name: "Desert Harvest FPO",
    fpo_location: "Jodhpur, Rajasthan",
    contact: "+919810001234",
    description:
      "A savory roasted mix with bajra base — great with tea.",
    ingredients: "Bajra flakes, peanuts, spices, curry leaves, salt",
    shelf_life: "90 days",
  },
  {
    id: "004",
    name: "Ragi Malt Powder",
    image: "product-images/IMG-20260323-WA0004.jpg.jpeg",
    weight: "500g",
    category: "Beverage Mix",
    millet_type: "Ragi",
    fpo_name: "Kaveri Millet Collective FPO",
    fpo_location: "Mysuru, Karnataka",
    contact: "+917760009876",
    description: "",
    ingredients: "",
    shelf_life: "12 months",
  },
  {
    id: "005",
    name: "Jowar Puffs",
    image: "product-images/IMG-20260323-WA0005.jpg.jpeg",
    weight: "60g",
    category: "Snacks",
    millet_type: "Jowar",
    fpo_name: "Green Fields FPO",
    fpo_location: "Nashik, Maharashtra",
    contact: "+919555667788",
    description:
      "Light, crunchy jowar puffs with a mild seasoning — kid-friendly.",
    ingredients: "Jowar, rice bran oil, spices, salt",
    shelf_life: "",
  },
];
