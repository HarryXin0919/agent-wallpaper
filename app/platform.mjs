// The desktop layer for this operating system: Windows (re-parenting under the icon view) or macOS (a
// desktop-level window). Both answer the same questions; see desktop-win.mjs and desktop-mac.mjs.
const desk = process.platform === 'darwin' ? await import('./desktop-mac.mjs') : await import('./desktop-win.mjs');
export default desk;
