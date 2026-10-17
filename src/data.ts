export type Category =
  | "All finds"
  | "Dorm & living"
  | "Textbooks"
  | "Tech"
  | "Getting around"
  | "Free stuff";
export type Product = {
  id: string;
  title: string;
  category: Category;
  price: number;
  original?: number;
  image: string;
  seller: string;
  initials: string;
  color: string;
  condition: string;
  location: string;
  campus: string;
  courseCode?: string;
  tag?: string;
  description: string;
  checks: string[];
};
export const categories: Category[] = [
  "All finds",
  "Dorm & living",
  "Textbooks",
  "Tech",
  "Getting around",
  "Free stuff",
];
export const products: Product[] = [
  {
    id: "chair",
    title: "Your new favorite reading chair",
    category: "Dorm & living",
    price: 45,
    original: 129,
    image: "/images/chair.jpg",
    seller: "Sophie M.",
    initials: "SM",
    color: "#e8cfbd",
    condition: "Like new",
    location: "North campus",
    campus: "Alabama",
    tag: "A good little find",
    description:
      "My favorite corner of the room, ready for its next chapter. A comfortable accent chair with a sturdy frame. Light signs of use on the legs; no rips or stains. Pickup at an agreed public exchange location.",
    checks: [
      "Fabric and frame match the photos",
      "Chair is stable and comfortable",
      "Disclosed marks are acceptable",
    ],
  },
  {
    id: "lamp",
    title: "A little light for late nights",
    category: "Dorm & living",
    price: 18,
    original: 45,
    image: "/images/lamp.jpg",
    seller: "Alex R.",
    initials: "AR",
    color: "#d5dfce",
    condition: "Good",
    location: "Central campus",
    campus: "Alabama",
    description:
      "A warm reading lamp that got me through a lot of study sessions. Works well; a small scuff on the base is included in the condition notes. Bulb included.",
    checks: [
      "Lamp switches on and off",
      "Cord has no visible damage",
      "Base scuff matches the description",
    ],
  },
  {
    id: "books",
    title: "A fresh start for your bookshelf",
    category: "Textbooks",
    price: 24,
    original: 72,
    image: "/images/books.jpg",
    seller: "Jordan L.",
    initials: "JL",
    color: "#d8d2e7",
    condition: "Good",
    location: "South campus",
    campus: "Alabama",
    tag: "Ready for another semester",
    description:
      "A small collection of well-loved books. Some penciled annotations and light cover wear. Check titles and editions in person before accepting; this is a sample listing.",
    checks: [
      "Titles and editions are correct",
      "Pages are present and readable",
      "Annotations match the description",
    ],
  },
  {
    id: "headphones",
    title: "Find your focus. Lose the noise.",
    category: "Tech",
    price: 55,
    original: 110,
    image: "/images/headphones.jpg",
    seller: "Chris W.",
    initials: "CW",
    color: "#cbd9e3",
    condition: "Like new",
    location: "North campus",
    campus: "Alabama",
    description:
      "Over-ear headphones with a clean finish and comfortable cushions. Both sides work. Test pairing and sound at the exchange. Charging cable included; original box not included.",
    checks: [
      "Both speakers play audio",
      "Pairing and controls work",
      "Cushions and cable match the listing",
    ],
  },
  {
    id: "plant",
    title: "A tiny roommate, no rent required",
    category: "Free stuff",
    price: 0,
    image: "/images/plant.jpg",
    seller: "Maya K.",
    initials: "MK",
    color: "#d9ddbf",
    condition: "Healthy",
    location: "Central campus",
    campus: "Alabama",
    tag: "Free to a good dorm",
    description:
      "Moving away and hoping this little plant finds a sunny new window. Pot included. Free to someone who will give it a little love.",
    checks: [
      "Plant and pot match the photo",
      "No visible pests",
      "You can transport it safely",
    ],
  },
  {
    id: "bike",
    title: "Your 8:00 a.m. shortcut",
    category: "Getting around",
    price: 85,
    original: 220,
    image: "/images/bike.jpg",
    seller: "Ethan B.",
    initials: "EB",
    color: "#ded1c3",
    condition: "Good",
    location: "South campus",
    campus: "Alabama",
    description:
      "A city bike for getting around campus. Normal cosmetic wear. Check frame size, brakes, tires, and gears in person. Ask the seller for ownership information before committing.",
    checks: [
      "Frame size is suitable",
      "Brakes and gears work",
      "Ownership information is satisfactory",
    ],
  },
  {
    id: "camera",
    title: "Make the semester worth keeping",
    category: "Tech",
    price: 90,
    original: 180,
    image: "/images/camera.jpg",
    seller: "Emma T.",
    initials: "ET",
    color: "#e3c9be",
    condition: "Good",
    location: "Cross-campus pickup",
    campus: "Auburn",
    tag: "Auburn find",
    description:
      "An entry-level camera for everyday campus moments. Cosmetic wear on the body. Battery and strap included. This listing requires a separately agreed cross-campus handoff.",
    checks: [
      "Camera powers on and saves photos",
      "Lens and sensor condition checked",
      "Battery and included parts match",
    ],
  },
  {
    id: "side-table",
    title: "The missing piece of your room",
    category: "Dorm & living",
    price: 30,
    original: 65,
    image: "/images/room.jpg",
    seller: "Olivia D.",
    initials: "OD",
    color: "#d9d3c7",
    condition: "Like new",
    location: "Central campus",
    campus: "Alabama",
    description:
      "A compact side table for a book, a coffee, and whatever your week brings. Confirm dimensions before reserving. Photo is illustrative of the room style.",
    checks: [
      "Dimensions work for your room",
      "Surface and legs are stable",
      "Condition matches the description",
    ],
  },
];
export const flyers = [
  {
    id: "repair",
    type: "THIS WEEK ON CAMPUS",
    title: "A little fixing.\nA lot more living.",
    description:
      "Bring your wobbly chair, well-loved jeans, or questions. Let’s give good things another go.",
    date: "OCT 22",
    time: "Thursday · 3–6 PM",
    location: "Public campus space · location to be confirmed",
    host: "Relay Reuse Club",
    theme: "lime",
    icon: "repair",
  },
  {
    id: "market",
    type: "THE WEEKEND PLAN",
    title: "Small finds.\nBig main-character energy.",
    description:
      "A student swap meet for the pieces that make your space yours. Browse, trade, and say hello.",
    date: "OCT 24",
    time: "Saturday · 11 AM–2 PM",
    location: "Public campus space · location to be confirmed",
    host: "Campus Creatives",
    theme: "peach",
    icon: "market",
  },
  {
    id: "coffee",
    type: "SPONSORED · SAMPLE CAMPAIGN",
    title: "A good exchange\ndeserves a good coffee.",
    description:
      "An example of a local café sponsoring a campus exchange session. No live offer or payment subsidy.",
    date: "LOCAL",
    time: "Campaign concept",
    location: "Campus partner program",
    host: "The Corner Café · demo advertiser",
    theme: "purple",
    icon: "coffee",
  },
];
