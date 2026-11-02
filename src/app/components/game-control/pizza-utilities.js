// Tailwind utility classes. Keep every candidate literal so the compiler can discover it.
export const pizzaUtilities = [
  // base · & .pizza-wheel
  "[&_.pizza-wheel]:[aspect-ratio:1] [&_.pizza-wheel]:[background:repeating-conic-gradient(#7d1834_0deg_2deg,#321b28_2deg_44deg,#e3b15d_44deg_45deg)] [&_.pizza-wheel]:[border:3px_solid_#e4b66c] [&_.pizza-wheel]:rounded-full [&_.pizza-wheel]:[max-width:100%] [&_.pizza-wheel]:h-full [&_.pizza-wheel]:[max-height:360px] [&_.pizza-wheel]:relative [&_.pizza-wheel]:[container-type:size]",
  // base · & .pizza-hub
  "[&_.pizza-hub]:[color:#fff2b5] [&_.pizza-hub]:text-center [&_.pizza-hub]:[background:radial-gradient(#e2942f,#9a2942)] [&_.pizza-hub]:[border:2px_solid_#ffe2a2] [&_.pizza-hub]:rounded-full [&_.pizza-hub]:flex-col [&_.pizza-hub]:justify-center [&_.pizza-hub]:items-center [&_.pizza-hub]:[font:700_12px_Arial] [&_.pizza-hub]:flex [&_.pizza-hub]:absolute [&_.pizza-hub]:[inset:32%]",
  // base · & .pizza-hub span
  "[&_.pizza-hub_span]:[font-size:12cqw]",
  // base · & .pizza-hub b
  "[&_.pizza-hub_b]:[font-size:5cqw]",
  // base · & .pizza-hub small
  "[&_.pizza-hub_small]:[font-size:4cqw]",
  // base · & .pizza-wheel .pizza-food
  "[&_.pizza-wheel_.pizza-food]:[color:#273e2c] [&_.pizza-wheel_.pizza-food]:[opacity:1] [&_.pizza-wheel_.pizza-food]:[background:linear-gradient(#ffffe8,#bee0b8)] [&_.pizza-wheel_.pizza-food]:[border:2px_solid_#b28a42] [&_.pizza-wheel_.pizza-food]:rounded-full [&_.pizza-wheel_.pizza-food]:flex-col [&_.pizza-wheel_.pizza-food]:justify-center [&_.pizza-wheel_.pizza-food]:items-center [&_.pizza-wheel_.pizza-food]:[width:23%] [&_.pizza-wheel_.pizza-food]:[height:23%] [&_.pizza-wheel_.pizza-food]:[min-height:0] [&_.pizza-wheel_.pizza-food]:p-0 [&_.pizza-wheel_.pizza-food]:[font-size:5cqw] [&_.pizza-wheel_.pizza-food]:flex [&_.pizza-wheel_.pizza-food]:absolute [&_.pizza-wheel_.pizza-food]:[transform:translate(-50%,-50%)] [&_.pizza-wheel_.pizza-food]:[box-shadow:0_3px_5px_#0008]",
  // base · & .pizza-food span
  "[&_.pizza-food_span]:[font-size:10cqw] [&_.pizza-food_span]:[line-height:1]",
  // base · & .pizza-food small
  "[&_.pizza-food_small]:[font-size:4cqw]",
  // base · & .pizza-wheel .pizza-food[aria-pressed=true]
  "[&_.pizza-wheel_.pizza-food[aria-pressed=true]]:[outline:3px_solid_#b984ff]",
  // base · & .pizza-wheel .pizza-lit
  "[&_.pizza-wheel_.pizza-lit]:[background:#ffcf7a] [&_.pizza-wheel_.pizza-lit]:[border-color:#fff] [&_.pizza-wheel_.pizza-lit]:[animation:.45s_ease-in-out_infinite_alternate_pizza-pizzaGlow] [&_.pizza-wheel_.pizza-lit]:[box-shadow:0_0_18px_#ffe372]",
  // (prefers-reduced-motion:reduce) · & .pizza-wheel .pizza-lit
  "[@media_(prefers-reduced-motion:reduce)]:[&_.pizza-wheel_.pizza-lit]:[animation:none]",
  // base · & .pizza-wheel .pizza-food:disabled
  "[&_.pizza-wheel_.pizza-food:disabled]:[opacity:1]",
  // base · & .pizza-food .pizza-foodIcon
  "[&_.pizza-food_.pizza-foodIcon]:object-contain [&_.pizza-food_.pizza-foodIcon]:[width:10cqw] [&_.pizza-food_.pizza-foodIcon]:[height:10cqw] [&_.pizza-food_.pizza-foodIcon]:block",
].join(" ");

export default {
  "wheel": "pizza-wheel",
  "hub": "pizza-hub",
  "food": "pizza-food",
  "lit": "pizza-lit",
  "foodIcon": "pizza-foodIcon"
};
