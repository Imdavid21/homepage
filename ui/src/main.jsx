import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import brand from "./brand.json";
import * as dither from "./dither.js";
window.__dither = dither;

// Render synchronously so the card engine (loaded next) finds #stage and the side buttons.
const root = createRoot(document.getElementById("root"));
flushSync(() => root.render(<App socials={brand.socials} />));
