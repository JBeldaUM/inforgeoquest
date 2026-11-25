// Official Kahoot geometric answer shapes (Triangle, Diamond, Circle, Square)
window.KAHOOT_SHAPES = [
  // 0: Red Triangle
  '<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,4 30,28 2,28"/></svg>',
  // 1: Blue Diamond
  '<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,2 30,16 16,30 2,16"/></svg>',
  // 2: Yellow Circle
  '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/></svg>',
  // 3: Green Square
  '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="4" width="24" height="24" rx="2"/></svg>',
];

window.KAHOOT_AVATARS = [
  '🦊', '🐼', '🦁', '🐸', '🐙', '🦄',
  '🐨', '🐯', '🐧', '🐝', '🦖', '🚀',
];

window.escapeHtml = function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
