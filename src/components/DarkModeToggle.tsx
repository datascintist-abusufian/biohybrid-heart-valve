import React from "react";

export default function DarkModeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    root.classList.toggle("dark");
    localStorage.setItem(
      "theme",
      root.classList.contains("dark") ? "dark" : "light"
    );
  };

  React.useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") document.documentElement.classList.add("dark");
  }, []);

  return (
    <button
      onClick={toggle}
      className="rounded-xl px-3 py-2 text-sm font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90"
      title="Toggle dark mode"
    >
      Toggle Theme
    </button>
  );
}