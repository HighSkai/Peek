import { lazy, StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { inTauri, windowLabel } from "./lib/ipc"
import "./index.css"

const IslandApp = lazy(() => import("./island/IslandApp"))
const SettingsApp = lazy(() => import("./settings/SettingsApp"))

// Block the browser context menu and accidental reloads inside the app windows.
if (inTauri) {
  window.addEventListener("contextmenu", (e) => {
    const t = e.target as HTMLElement
    if (!t.closest("input, textarea, .selectable")) e.preventDefault()
  })
  window.addEventListener("keydown", (e) => {
    if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) e.preventDefault()
  })
}

windowLabel().then((label) => {
  const isSettings = label === "settings"
  if (!inTauri && !isSettings) document.body.classList.add("demo-desktop")
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Suspense fallback={null}>{isSettings ? <SettingsApp /> : <IslandApp />}</Suspense>
    </StrictMode>,
  )
})
