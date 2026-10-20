// 動作圖片不內嵌文字；要領由網頁文字呈現。
function movementIllustration(id) {
  const guides = {
    'neutral-db-shoulder-press': ['中立握啞鈴肩推', '啞鈴放在肩膀兩側，掌心相對。', '往上推，保持軀幹穩定，避免過度拱腰。'],
    'incline-db-press': ['低上斜中立握啞鈴胸推', '低上斜躺穩，手腕在手肘上方。', '推向胸口上方，肩膀保持穩定。'],
    'lateral-raise': ['啞鈴側平舉', '手肘微彎，啞鈴放身體兩側。', '手肘帶動向外抬，約到肩高即可。'],
    'db-overhead-triceps-extension': ['啞鈴過頭三頭屈伸', '雙手握穩同一支啞鈴，上臂朝上。', '伸直手肘，上臂位置大致固定。'],
    'chest-supported-row': ['胸靠斜椅啞鈴划船', '胸口貼斜椅，手臂自然下垂。', '手肘拉向腰側，胸口持續貼椅。'],
    'chest-supported-reverse-fly': ['胸靠斜椅反向飛鳥', '胸口貼斜椅，手肘微彎。', '手臂向兩側展開，避免做成划船。'],
    'hammer-curl': ['啞鈴槌式彎舉', '掌心相對，上臂放身體兩側。', '只彎手肘，不甩身體或抬上臂。'],
    'dead-bug': ['死蟲式', '仰躺、手朝上，髖膝約呈直角。', '伸展對側手腳，保持下背與骨盆穩定。'],
    'goblet-squat': ['箱式高腳杯深蹲', '一支啞鈴抱胸，穩固椅子放身後。', '臀部往後下坐，輕碰椅面再起身。'],
    'db-rdl': ['啞鈴羅馬尼亞硬舉', '膝蓋微彎，雙手各持一支啞鈴。', '臀部往後推，啞鈴貼近腿，背部保持穩定。'],
    'db-hip-thrust': ['啞鈴臀推', '上背靠穩椅緣，啞鈴加墊放在髖部。', '腳掌踩穩推髖，頂端收緊臀部，不過度拱腰。'],
    'standing-calf-raise': ['站姿提踵', '單手扶穩，另一手持啞鈴。', '垂直踮腳，頂端停一秒，再慢慢下降。'],
    'band-assisted-pull-up': ['彈力帶輔助引體向上', '握穩單槓，確認輔助帶固定妥當。', '胸口往槓靠近，不踢腿、不伸脖子。'],
    'cindy-push-up': ['上斜伏地挺身', '圖示為上斜版本，雙手撐穩椅面。', '整個身體一起下降、推回，不塌腰。'],
    'cindy-air-squat': ['徒手深蹲', '徒手站穩，雙腳約與肩同寬。', '在可控制的深度下蹲，再踩穩站起。']
  };

  const key = id === 'cindy-pull-up' ? 'band-assisted-pull-up' : id;
  if (!Object.prototype.hasOwnProperty.call(guides, key)) return '';
  const guide = guides[key];

  return '<div class="movement-demo movement-photo-demo" aria-label="動作起始與動作位置示意">' +
    '<figure class="movement-frame">' +
    '<img class="movement-photo" data-fitweek-demo ' +
    'src="./images/exercises/' + key + '.png" ' +
    'alt="' + guide[0] + '，左圖為起始位置，右圖為動作位置" ' +
    'loading="lazy" decoding="async" width="1448" height="1086">' +
    '<p data-fitweek-demo-fallback hidden role="status">圖片暫時無法顯示，請參考下方動作要領。</p>' +
    '<figcaption><p><b>左圖｜起始位置：</b>' + guide[1] + '</p>' +
    '<p><b>右圖｜動作位置：</b>' + guide[2] + '</p></figcaption>' +
    '</figure></div>';
}

// 圖片載入失敗時，完整文字要領仍可使用。
if (typeof document !== 'undefined') {
  document.addEventListener('error', function (event) {
    const target = event.target;
    if (!target || target.tagName !== 'IMG' || !target.hasAttribute('data-fitweek-demo')) return;
    target.style.display = 'none';
    const frame = target.closest('.movement-frame');
    const fallback = frame && frame.querySelector('[data-fitweek-demo-fallback]');
    if (fallback) fallback.hidden = false;
  }, true);
}
