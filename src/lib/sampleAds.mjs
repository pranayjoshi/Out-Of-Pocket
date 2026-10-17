// Shared seed records for the local campaign service and browser fallback.
export const sampleAds = ['Alabama', 'Auburn'].flatMap(campus => {
  const school = campus === 'Alabama' ? 'University of Alabama' : 'Auburn University';
  const website = campus === 'Alabama' ? 'https://www.ua.edu/' : 'https://www.auburn.edu/';
  const common = { campus, status: 'live', start: '', end: '', prompt: '', url: website, cta: 'Explore campus', sample: true };
  return [
    { ...common, id: `sample-${campus.toLowerCase()}-reuse`, title: 'Good things get another go.', description: 'A campus repair afternoon for well-loved things. Sample event, ready to make your own.', sponsor: `${school} · sample campus partner`, image: '/images/chair.jpg', kind: 'Campus event', placements: ['Discover', 'Exchanges'] },
    { ...common, id: `sample-${campus.toLowerCase()}-research`, title: 'Your perspective could shape what’s next.', description: 'Make a little time for campus research. Sample opportunity; no live study enrollment.', sponsor: `${school} · sample research partner`, image: '/images/books.jpg', kind: 'Research study', placements: ['Campus board', 'My plans'] },
  ];
});
