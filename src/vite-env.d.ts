/// <reference types="vite/client" />

// Vite's `?raw` suffix imports return a string. Without this declaration,
// TypeScript doesn't know the type and errors on the words.txt import.
declare module '*?raw' {
  const content: string;
  export default content;
}
