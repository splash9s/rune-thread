// ==========================================
// AD SLOTS (placeholders until an ad network is connected)
// adSlotHTML(name, w, h, pos) returns a labelled box where an ad will go: the rune refresh window, the stamina refill
// window and the Free 10 Diamond card. The box ignores taps, so the button under it still works. When the ad network
// is connected, fill the box (by name) instead of changing the callers.
// ==========================================
function adSlotHTML(name, w, h, pos = '') {
    return `<div class="ad-slot" data-ad="${name}" style="${pos}width:${w}px;height:${h}px;margin:6px auto;display:flex;align-items:center;justify-content:center;border:1px dashed #64748b;border-radius:6px;background:rgba(15,23,42,.6);color:#94a3b8;font-size:11px;letter-spacing:.05em;pointer-events:none;">Ad space</div>`;
}
