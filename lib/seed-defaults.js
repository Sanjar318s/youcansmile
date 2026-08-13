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
    { id: 'p-keychain-smile', categoryId: 'keychains', featured: true, inStock: true, createdAt: now, price: 45000, tags: ['keychain'], images: [img], title: tri('Брелок Smile', 'Smile brelok', 'Smile Keychain'), desc: tri('Милый брелок ручной работы.', "Qo'lda yasalgan brelok.", 'Cute handmade keychain.') },
    { id: 'p-pendant-crystal', categoryId: 'pendants', featured: true, inStock: true, createdAt: now, price: 150000, tags: ['pendant'], images: [img], title: tri('Кулон Crystal', 'Crystal kulon', 'Crystal Pendant'), desc: tri('Нежный кулон.', 'Nozik kulon.', 'Delicate pendant.') },
    { id: 'p-choker-sage', categoryId: 'chokers', featured: true, inStock: true, createdAt: now, price: 110000, tags: ['choker'], images: [img], title: tri('Чокер Sage', 'Sage choker', 'Sage Choker'), desc: tri('Чокер ручной работы.', "Qo'lda choker.", 'Handmade choker.') },
    { id: 'p-bracelet-beads', categoryId: 'bracelets', featured: true, inStock: true, createdAt: now, price: 89000, tags: ['bracelet'], images: [img], title: tri('Браслет из бусин', 'Munchoqli braslet', 'Beaded Bracelet'), desc: tri('Браслет ручной сборки.', 'Qo\'lda braslet.', 'Beaded bracelet.') },
    { id: 'p-phone-charm', categoryId: 'phone-charms', featured: true, inStock: true, createdAt: now, price: 38000, tags: ['phone'], images: [img], title: tri('Подвеска для телефона', 'Telefon osmagi', 'Phone Charm'), desc: tri('Подвеска на телефон.', 'Telefon osmasi.', 'Phone charm.') },
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
  promos: [
    {
      id: 'promo-sale',
      tone: 'coral',
      badge: tri('Акция', 'Aksiya', 'Sale'),
      title: tri('−15% на украшения недели', "Hafta taqinchoqlariga −15%", '−15% on jewelry this week'),
      text: tri(
        'Кулоны, чокеры и браслеты ручной работы — успейте до воскресенья.',
        "Qo'lda yasalgan kulon, choker va brasletlar — yakshanbagacha.",
        'Handmade pendants, chokers and bracelets — until Sunday.'
      ),
      cta: tri('К украшениям', 'Taqinchoqlarga', 'Shop jewelry'),
      href: 'catalog.html',
    },
    {
      id: 'promo-new',
      tone: 'sage',
      badge: tri('Новинка', 'Yangilik', 'New'),
      title: tri('Новые брелки и подвески', 'Yangi brelok va osmalar', 'New keychains & charms'),
      text: tri(
        'Брелки и подвески для телефона — маленькие детали, которые радуют каждый день.',
        'Breloklar va telefon osmalari — har kuni quvontiradigan kichik detallar.',
        'Keychains and phone charms — little details that brighten the day.'
      ),
      cta: tri('Смотреть брелки', "Breloklarni ko'rish", 'Browse keychains'),
      href: 'catalog.html?cat=keychains',
    },
    {
      id: 'promo-custom',
      tone: 'cream',
      badge: tri('Индивидуально', 'Individual', 'Custom'),
      title: tri('Украшение по вашему желанию', "O'zingiz xohlagan taqinchoq", 'Jewelry made for you'),
      text: tri(
        'Опишите идею — например брелок по персонажу. Сделаем кулон, чокер или подвеску под вас.',
        "G'oyangizni yozing — masalan personaj breloki. Kulon, choker yoki osma tayyorlaymiz.",
        'Describe your idea — a character keychain, pendant, choker or phone charm made for you.'
      ),
      cta: tri('Оформить заявку', "So'rov yuborish", 'Start custom order'),
      href: 'custom-order.html',
    },
  ],
  promoSlider: {
    bgMode: 'preset',
    preset: 'aurora',
    imageUrl: '',
    overlay: 0.35,
  },
  heroTitle: tri('YouCanSmile', 'YouCanSmile', 'YouCanSmile'),
  heroSubtitle: tri('Украшения ручной работы', "Qo'lda taqinchoqlar", 'Handmade jewelry'),
  about: tri('YouCanSmile — украшения ручной работы.', "YouCanSmile — qo'lda taqinchoqlar.", 'YouCanSmile — handmade jewelry.'),
  footerAbout: tri('YouCanSmile — handmade-украшения', 'YouCanSmile — handmade', 'YouCanSmile — handmade jewelry'),
  contacts: { telegram: 'https://t.me/youcansmile', whatsapp: 'https://wa.me/998901234567', email: 'hello@youcansmile.ru', instagram: 'https://instagram.com/youcansmile' },
  social: { telegram: 'https://t.me/youcansmile', instagram: 'https://instagram.com/youcansmile', whatsapp: 'https://wa.me/998901234567' },
  telegramChannel: '',
  adminPassword: 'admin123',
  appearance: { wallpaper: '', colors: {} },
  uiTexts: {},
  uiIcons: {},
});

module.exports = { categories, products, settings };
