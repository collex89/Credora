// About page copy, kept separate from App.jsx the same way legalContent.js
// and dailyVerses.js are, so the actual words can be edited without touching
// component logic.

export const MISSION = `Crescamus comes from the Latin for "let us grow." It's built to help you grow in faith through Scripture, prayer, the lives of the Saints, and a community doing the same.`;

// icon refers to a key in the Icons object in App.jsx.
export const ABOUT_FEATURES = [
  {
    icon: 'Bible',
    title: 'Bible',
    description: 'The full Catholic Bible, Old and New Testament, including the Deuterocanonical books, organized and ready to read.'
  },
  {
    icon: 'Rosary',
    title: 'Prayers',
    description: 'Track a daily prayer streak, set reminders for the Rosary and the Angelus, and keep personal prayer intentions.'
  },
  {
    icon: 'Sparkles',
    title: 'Saints',
    description: 'Explore the life stories, feast days, and quotes of the Saints.'
  },
  {
    icon: 'Audio',
    title: 'Audio',
    description: 'Gregorian chants, hymns, the Rosary, and Scripture readings. Every track is real and properly licensed, not a placeholder.'
  },
  {
    icon: 'Users',
    title: 'Community',
    description: 'Share reflections, follow others, and message people in a faith-centered feed.'
  }
];

export const CONTENT_SOURCING_NOTE = `Scripture, Saint biographies, and audio are drawn from public-domain and Creative Commons sources (Wikipedia/Wikimedia Commons, LibriVox, Internet Archive), with attribution shown in the app where it applies.`;
