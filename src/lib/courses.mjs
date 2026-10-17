import catalog from '../catalog/courses.json' with { type: 'json' };
export { catalog };
export const normalizeCode = value => typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
export function coursesFor(campus) { return catalog.filter(course => course.campus === campus); }
export function matchCourses(campus, codes) {
  const normalized = new Set(codes.map(normalizeCode));
  return coursesFor(campus).filter(course => normalized.has(normalizeCode(course.code)));
}
export function recommendationReason(product, campus, codes) {
  if (product.campus !== campus || product.seller === 'You') return '';
  const courses = matchCourses(campus, codes);
  const exact = courses.find(c => normalizeCode(c.code) === normalizeCode(product.courseCode));
  if (exact) return `For your ${exact.code} class · check edition and requirements`;
  const text = `${product.title} ${product.description}`.toLowerCase();
  const related = courses.find(c => c.keywords.some(word => text.includes(word)));
  return related ? `May help with ${related.code} · based on listing details` : '';
}
