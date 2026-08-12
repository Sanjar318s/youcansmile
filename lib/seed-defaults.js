function tri(ru, uz, en) {
  return { ru, uz, en };
}

const categories = () => [
  { id: 'keychains', icon: '🔑', name: tri('Брелки', 'Breloklar', 'Keychains') },
  { id: 'pendants', icon: '💎', name: tri('Кулоны', 'Kulonlar', 'Pendants') },
  { id: 'chokers', icon: '✨', name: tri('Чокеры', 'Chokerlar', 'Chokers') },
  { id: 'bracelets', icon: '📿', name: tri('Браслеты', 'Brasletlar', 'Bracelets') },
  { id: 'phone-charms', icon: '📱', name: tri('Подвески для телефона', 'Telefon osmalari', 'Phone charms') },
];

const products = () => {
  const img = 'img/logo-ycs.png';
  const now = Date.now();
  return [
    { id: 'p-keychain-smile', categoryId: 'keychains', featured: true, inStock: true, createdAt: now, gender: 'unisex', price: 45000, tags: ['keychain'], images: [img], title: tri('Брелок Smile', 'Smile brelok', 'Smile Keychain'), desc: tri('Милый брелок ручной работы.', "Qo'lda yasalgan brelok.", 'Cute handmade keychain.') },
    { id: 'p-pendant-crystal', categoryId: 'pendants', featured: true, inStock: true, createdAt: now, gender: 'female', price: 150000, tags: ['pendant'], images: [img], title: tri('Кулон Crystal', 'Crystal kulon', 'Crystal Pendant'), desc: tri('Нежный кулон.', 'Nozik kulon.', 'Delicate pendant.') },
    { id: 'p-choker-sage', categoryId: 'chokers', featured: true, inStock: true, createdAt: now, gender: 'female', price: 110000, tags: ['choker'], images: [img], title: tri('Чокер Sage', 'Sage choker', 'Sage Choker'), desc: tri('Чокер ручной работы.', "Qo'lda choker.", 'Handmade choker.') },
    { id: 'p-bracelet-beads', categoryId: 'bracelets', featured: true, inStock: true, createdAt: now, gender: 'unisex', price: 89000, tags: ['bracelet'], images: [img], title: tri('Браслет из бусин', 'Munchoqli braslet', 'Beaded Bracelet'), desc: tri('Браслет ручной сборки.', 'Qo\'lda braslet.', 'Beaded bracelet.') },
    { id: 'p-phone-charm', categoryId: 'phone-charms', featured: true, inStock: true, createdAt: now, gender: 'unisex', price: 38000, tags: ['phone'], images: [img], title: tri('Подвеска для телефона', 'Telefon osmagi', 'Phone Charm'), desc: tri('Подвеска на телефон.', 'Telefon osmasi.', 'Phone charm.') },
  ];
};

const settings = () => ({
  siteName: 'YouCanSmile',
  currency: 'UZS',
  usdRate: 12500,
  cardNumber: '8600123456781234',
  cardRecipient: 'Mirsagatova Madina',
  cardRequisites: {
    ru: 'Перевод на карту: 8600 **** **** 1234, получатель Mirsagatova Madina.',
    uz: "Kartaga o'tkazma: 8600 **** **** 1234, oluvchi Mirsagatova Madina.",
    en: 'Card transfer: 8600 **** **** 1234, recipient Mirsagatova Madina.',
  },
  pickupPoints: [
    { id: 'chorsu', name: tri('Чорсу', 'Chorsu', 'Chorsu'), coords: [41.3265, 69.235], address: tri('Ташкент, Чорсу', 'Toshkent, Chorsu', 'Tashkent, Chorsu') },
  ],
  announcement: tri('Брелки · кулоны · чокеры · браслеты · подвески для телефона', 'Breloklar · kulonlar · chokerlar', 'Keychains · pendants · chokers'),
  promos: [],
  heroTitle: tri('YouCanSmile', 'YouCanSmile', 'YouCanSmile'),
  heroSubtitle: tri('Украшения ручной работы', "Qo'lda taqinchoqlar", 'Handmade jewelry'),
  about: tri('YouCanSmile — украшения ручной работы.', "YouCanSmile — qo'lda taqinchoqlar.", 'YouCanSmile — handmade jewelry.'),
  footerAbout: tri('YouCanSmile — handmade-украшения', 'YouCanSmile — handmade', 'YouCanSmile — handmade jewelry'),
  contacts: { telegram: 'https://t.me/youcansmile', whatsapp: 'https://wa.me/998901234567', email: 'hello@youcansmile.ru', instagram: 'https://instagram.com/youcansmile' },
  social: { telegram: 'https://t.me/youcansmile', instagram: 'https://instagram.com/youcansmile', whatsapp: 'https://wa.me/998901234567' },
  adminPassword: 'admin123',
  appearance: { wallpaper: '', colors: {} },
  uiTexts: {},
  uiIcons: {},
});

module.exports = { categories, products, settings };
