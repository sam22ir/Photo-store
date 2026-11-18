// Ready-to-use prompt templates. Each has a name and a prompt in English, French and Arabic.
// Text inside [BRACKETS] is for the customer to replace with their own words.
window.LAMSA_TEMPLATES = [
  {
    id: 'studio', quick: true,
    name: { en: 'Studio', fr: 'Studio', ar: 'استوديو' },
    prompt: {
      en: 'Clean white studio background with soft natural shadows, bright even light, sharp professional product photo.',
      fr: 'Fond de studio blanc et propre avec des ombres douces, lumière claire et uniforme, photo produit professionnelle et nette.',
      ar: 'خلفية استوديو بيضاء نظيفة مع ظلال ناعمة، إضاءة ساطعة ومتساوية، صورة منتج احترافية وواضحة.',
    },
  },
  {
    id: 'luxury', quick: true,
    name: { en: 'Luxury', fr: 'Luxe', ar: 'فاخر' },
    prompt: {
      en: 'Dark elegant background with dramatic soft spotlight and gentle reflections, premium luxury feel.',
      fr: 'Fond sombre et élégant avec un éclairage dramatique doux et de légers reflets, ambiance luxe haut de gamme.',
      ar: 'خلفية داكنة أنيقة مع إضاءة درامية ناعمة وانعكاسات خفيفة، إحساس فاخر وراقٍ.',
    },
  },
  {
    id: 'outdoor', quick: true,
    name: { en: 'Outdoor', fr: 'Extérieur', ar: 'خارجي' },
    prompt: {
      en: 'Natural outdoor lifestyle scene in warm daylight, softly blurred background, real and inviting.',
      fr: 'Scène extérieure naturelle à la lumière du jour, arrière-plan légèrement flou, réaliste et accueillante.',
      ar: 'مشهد خارجي طبيعي في ضوء النهار الدافئ، خلفية ضبابية خفيفة، واقعي وجذاب.',
    },
  },
  {
    id: 'ad', quick: true,
    name: { en: 'Ad poster', fr: 'Affiche pub', ar: 'ملصق إعلاني' },
    prompt: {
      en: 'Instagram ad poster with a bold modern layout and bright colors. Add the text "[PRODUCT NAME - PRICE DA]".',
      fr: 'Affiche publicitaire Instagram avec une mise en page moderne et des couleurs vives. Ajoutez le texte « [NOM DU PRODUIT - PRIX DA] ».',
      ar: 'ملصق إعلاني لإنستغرام بتصميم عصري جريء وألوان زاهية. أضف النص "[اسم المنتج - السعر دج]".',
    },
  },
  {
    id: 'marble',
    name: { en: 'White marble', fr: 'Marbre blanc', ar: 'رخام أبيض' },
    prompt: {
      en: 'Place the product on a white marble surface next to a window, soft morning light, a few green leaves around it, calm and clean, high-end look.',
      fr: 'Posez le produit sur une surface en marbre blanc près d\'une fenêtre, douce lumière du matin, quelques feuilles vertes autour, ambiance calme et propre, look haut de gamme.',
      ar: 'ضع المنتج على سطح من الرخام الأبيض بجانب نافذة، مع ضوء صباحي ناعم وبعض الأوراق الخضراء حوله، أجواء هادئة ونظيفة وفخمة.',
    },
  },
  {
    id: 'hand',
    name: { en: 'In a hand', fr: 'Dans une main', ar: 'في اليد' },
    prompt: {
      en: 'A hand holding the product, blurred cozy café in the background, warm natural light, real lifestyle photo for Instagram.',
      fr: 'Une main qui tient le produit, un café chaleureux flou en arrière-plan, lumière naturelle chaude, vraie photo lifestyle pour Instagram.',
      ar: 'يد تمسك المنتج، وخلفها مقهى دافئ وضبابي، ضوء طبيعي دافئ، صورة واقعية بأسلوب لايف ستايل لإنستغرام.',
    },
  },
  {
    id: 'flatlay',
    name: { en: 'Flat lay', fr: 'Vue de dessus', ar: 'تصوير من الأعلى' },
    prompt: {
      en: 'Top-down flat lay of the product on a soft pastel background, with a few small matching props around it, neat and balanced.',
      fr: 'Vue de dessus du produit sur un fond pastel doux, avec quelques petits accessoires assortis autour, propre et équilibré.',
      ar: 'تصوير من الأعلى للمنتج على خلفية بألوان باستيل هادئة، مع بعض الأغراض الصغيرة المتناسقة حوله، مرتب ومتوازن.',
    },
  },
  {
    id: 'nature',
    name: { en: 'Fresh nature', fr: 'Nature fraîche', ar: 'طبيعة منعشة' },
    prompt: {
      en: 'The product standing on a wet stone, surrounded by fresh green leaves and water drops, fresh and natural feeling.',
      fr: 'Le produit posé sur une pierre mouillée, entouré de feuilles vertes fraîches et de gouttes d\'eau, sensation fraîche et naturelle.',
      ar: 'المنتج على حجر مبلل، تحيط به أوراق خضراء منعشة وقطرات ماء، إحساس بالانتعاش والطبيعة.',
    },
  },
  {
    id: 'food',
    name: { en: 'Home kitchen', fr: 'Cuisine maison', ar: 'مطبخ البيت' },
    prompt: {
      en: 'The product on a rustic wooden table in a warm home kitchen, soft window light, appetizing and homemade feeling.',
      fr: 'Le produit sur une table en bois rustique dans une cuisine chaleureuse, lumière douce de fenêtre, appétissant et fait maison.',
      ar: 'المنتج على طاولة خشبية تقليدية في مطبخ بيت دافئ، ضوء نافذة ناعم، يفتح الشهية وبطابع منزلي.',
    },
  },
  {
    id: 'ramadan',
    name: { en: 'Ramadan offer', fr: 'Offre Ramadan', ar: 'عرض رمضان' },
    prompt: {
      en: 'Ramadan theme: the product on a table with a glowing lantern, dates and a crescent moon in the background, warm golden light. Add the text "[RAMADAN KAREEM - YOUR OFFER]".',
      fr: 'Thème Ramadan : le produit sur une table avec une lanterne allumée, des dattes et un croissant de lune en arrière-plan, lumière dorée chaude. Ajoutez le texte « [RAMADAN KARIM - VOTRE OFFRE] ».',
      ar: 'أجواء رمضانية: المنتج على طاولة مع فانوس مضيء وتمر وهلال في الخلفية، ضوء ذهبي دافئ. أضف النص "[رمضان كريم - عرضك]".',
    },
  },
  {
    id: 'eid',
    name: { en: 'Eid celebration', fr: 'Fête de l\'Aïd', ar: 'عيد مبارك' },
    prompt: {
      en: 'Eid celebration theme with elegant gold and green decorations and soft glowing lights, festive and joyful. Add the text "[EID MUBARAK - YOUR OFFER]".',
      fr: 'Thème de l\'Aïd avec des décorations élégantes or et vert et des lumières douces, festif et joyeux. Ajoutez le texte « [AÏD MOUBARAK - VOTRE OFFRE] ».',
      ar: 'أجواء العيد مع زينة أنيقة باللونين الذهبي والأخضر وأضواء ناعمة، احتفالية ومبهجة. أضف النص "[عيد مبارك - عرضك]".',
    },
  },
  {
    id: 'sale',
    name: { en: 'Big sale poster', fr: 'Affiche soldes', ar: 'ملصق تخفيضات' },
    prompt: {
      en: 'Bold sale poster: the product in the center, bright solid color background, big text "[-30% | PRICE DA]", modern and eye-catching.',
      fr: 'Affiche de soldes percutante : le produit au centre, fond de couleur vive unie, grand texte « [-30% | PRIX DA] », moderne et accrocheur.',
      ar: 'ملصق تخفيضات جريء: المنتج في الوسط، خلفية بلون واحد زاهٍ، نص كبير "[-30% | السعر دج]"، عصري ويلفت الانتباه.',
    },
  },
  {
    id: 'tech',
    name: { en: 'Tech glow', fr: 'Look tech', ar: 'إضاءة تقنية' },
    prompt: {
      en: 'The product on a dark reflective surface with cool blue edge light and a soft glow, sleek modern tech look.',
      fr: 'Le produit sur une surface sombre et réfléchissante avec une lumière bleue froide sur les bords et un léger halo, look tech moderne.',
      ar: 'المنتج على سطح داكن عاكس مع إضاءة زرقاء باردة على الحواف وتوهج خفيف، مظهر تقني عصري.',
    },
  },
  {
    id: 'model',
    name: { en: 'Person using it', fr: 'Porté / utilisé', ar: 'شخص يستعمله' },
    prompt: {
      en: 'A person using or wearing the product in a natural everyday scene, friendly and real, soft daylight, the product clearly visible.',
      fr: 'Une personne qui utilise ou porte le produit dans une scène naturelle du quotidien, sympathique et réelle, lumière du jour douce, le produit bien visible.',
      ar: 'شخص يستعمل المنتج أو يرتديه في مشهد يومي طبيعي، ودود وواقعي، ضوء نهار ناعم، والمنتج واضح.',
    },
  },
];
