import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import IslandApp from "./island/IslandApp"
import { inTauri } from "./lib/ipc"
import "./index.css"

// Block the browser context menu and accidental reloads inside the app window.
if (inTauri) {
  window.addEventListener("contextmenu", (e) => {
    const t = e.target as HTMLElement
    if (!t.closest("input, textarea, .selectable")) e.preventDefault()
  })
  window.addEventListener("keydown", (e) => {
    if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) e.preventDefault()
  })
} else {
  document.body.classList.add("demo-desktop")
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IslandApp />
  </StrictMode>,
)
