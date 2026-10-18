// Shared seed records for the local campaign service and browser fallback.
const alabamaNotices = [
  {
    campus: 'Alabama', status: 'live', start: '', end: '', prompt: '', sample: false,
    id: 'ua-research-studies', title: 'Students needed for campus studies',
    description: 'The University of Alabama is looking for student participants. Short visits, and pay when the study pays.',
    sponsor: 'University of Alabama', image: '/images/ua-research.jpg', url: 'https://research.ua.edu/',
    cta: 'See open studies', kind: 'Research study',
    placements: ['Discover', 'Campus board', 'My plans', 'Exchanges'],
  },
  {
    campus: 'Alabama', status: 'live', start: '', end: '', prompt: '', sample: false,
    id: 'ua-student-assistant', title: 'Student assistant jobs are open',
    description: 'Campus offices are hiring student assistants this semester. Hours fit around class.',
    sponsor: 'University of Alabama', image: '/images/ua-assistant.jpg', url: 'https://careers.ua.edu/',
    cta: 'View openings', kind: 'Student job',
    placements: ['Discover', 'Campus board', 'My plans', 'Exchanges'],
  },
];

export const sampleAds = [...alabamaNotices, ...['Alabama', 'Auburn'].flatMap(campus => {
  const school = campus === 'Alabama' ? 'University of Alabama' : 'Auburn University';
  const website = campus === 'Alabama' ? 'https://www.ua.edu/' : 'https://www.auburn.edu/';
  const common = { campus, status: 'live', start: '', end: '', prompt: '', url: website, cta: 'Explore campus', sample: true };
  return [
    { ...common, id: `sample-${campus.toLowerCase()}-reuse`, title: 'Good things get another go.', description: 'A campus repair afternoon for well-loved things. Sample event, ready to make your own.', sponsor: `${school} · sample campus partner`, image: '/images/chair.jpg', kind: 'Campus event', placements: ['Discover', 'Exchanges'] },
    { ...common, id: `sample-${campus.toLowerCase()}-research`, title: 'Your perspective could shape what’s next.', description: 'Make a little time for campus research. Sample opportunity; no live study enrollment.', sponsor: `${school} · sample research partner`, image: '/images/books.jpg', kind: 'Research study', placements: ['Campus board', 'My plans'] },
  ];
})];
