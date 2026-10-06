const cookingStages = [
  { min: 3, name: 'Pasado por agua', texture: 'Clara apenas cuajada · yema líquida', tip: 'Ideal para mojar pan.' },
  { min: 5, name: 'Cremoso', texture: 'Clara firme · centro fluido y naranja', tip: 'Perfecto para tostadas y bowls.' },
  { min: 7, name: 'Mollet / semiduro', texture: 'Yema húmeda al centro', tip: 'Firme por fuera, cremosa en el centro.' },
  { min: 9, name: 'Duro', texture: 'Clara opaca · yema cocida y seca', tip: 'Ideal para ensaladas y rellenos.' },
];

const yolkColorStops = [
  { minute: 3, color: [242, 165, 22] },
  { minute: 7, color: [247, 201, 72] },
  { minute: 12, color: [243, 222, 138] },
];

function mixColor(first, second, progress) {
  return first.map((channel, index) => Math.round(channel + (second[index] - channel) * progress));
}

function colorToHex(channels) {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function initCooking() {
  const cookRange = document.getElementById('cookRange');
  const cookValue = document.getElementById('cookValue');
  const cookVisual = document.getElementById('cookVisual');
  const cookEgg = document.getElementById('cookEgg');
  const cookTexture = document.getElementById('cookTexture');
  const cookTip = document.getElementById('cookTip');

  const updateCook = () => {
    const minutes = Number(cookRange.value);
    const stage = cookingStages.reduce((selected, candidate) => minutes >= candidate.min ? candidate : selected, cookingStages[0]);
    const normalized = (minutes - 3) / 9;
    const firstStopIndex = minutes <= 7 ? 0 : 1;
    const firstStop = yolkColorStops[firstStopIndex];
    const secondStop = yolkColorStops[firstStopIndex + 1];
    const colorProgress = (minutes - firstStop.minute) / (secondStop.minute - firstStop.minute);
    const yolkColor = colorToHex(mixColor(firstStop.color, secondStop.color, colorProgress));
    const coreScale = minutes <= 4 ? 1.12 : minutes <= 6 ? .84 : minutes <= 8 ? .56 : .25 - ((minutes - 9) * .025);
    const gloss = minutes <= 4 ? 1 : minutes <= 6 ? .72 : minutes <= 8 ? .45 : .12;
    const whiteOpacity = .66 + normalized * .32;
    const spokenStage = stage.name.toLocaleLowerCase('es-AR');

    cookVisual.style.setProperty('--cook', String(normalized));
    cookVisual.style.setProperty('--yolk-color', yolkColor);
    cookVisual.style.setProperty('--core-scale', String(coreScale));
    cookVisual.style.setProperty('--yolk-gloss', String(gloss));
    cookVisual.style.setProperty('--white-opacity', String(whiteOpacity));
    cookVisual.classList.toggle('is-overcooked', minutes >= 11);
    cookValue.textContent = `${minutes} min · ${stage.name}`;
    cookTexture.textContent = stage.texture;
    cookTip.textContent = stage.tip;
    cookRange.setAttribute('aria-valuetext', `${minutes} minutos, ${spokenStage}`);
    cookEgg.setAttribute('aria-label', `Huevo ${spokenStage}, cocido durante ${minutes} minutos`);
  };

  cookRange.addEventListener('input', updateCook);
  document.querySelectorAll('[data-cook-minutes]').forEach((button) => {
    button.addEventListener('click', () => {
      cookRange.value = button.dataset.cookMinutes;
      updateCook();
      cookRange.focus();
    });
  });
  updateCook();
}
