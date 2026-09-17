"use client";
import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const applyDark = (dark: boolean) => {
  const root = document.documentElement;
  if (dark) root.classList.add("dark");
  else root.classList.remove("dark");
};

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const d = localStorage.getItem("darkMode") === "true";
    setDark(d);
    applyDark(d);
  }, []);

  const toggle = () => {
    const d = !dark;
    setDark(d);
    localStorage.setItem("darkMode", String(d));
    applyDark(d);
  };

  return (
    <button
      onClick={toggle}
      title={dark ? "切换到灯光模式" : "切换到深色模式"}
      aria-label={dark ? "切换到灯光模式" : "切换到深色模式"}
      className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
        dark
          ? "bg-gray-800 border-gray-700 text-yellow-300 hover:bg-gray-700"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
