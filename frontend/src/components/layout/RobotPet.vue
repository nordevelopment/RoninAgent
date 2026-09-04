<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const currentState = ref<'neutral' | 'happy' | 'thinking' | 'error'>('neutral');
const petSpeech = ref<string>('BEEP-BOOP!');
const showSpeech = ref<boolean>(false);
const neonColor = ref<string>('#00f0ff');
const mouthPath = ref<string>('M 43 46 Q 50 46 57 46');
const eyeRadius = ref<string>('4.5');

let randomTimer: any = null;
let speechTimeout: any = null;
let externalTimeout: any = null;
let isExternal = false;

const phrases = [
  'SYSTEMS OPTIMAL',
  'READY FOR COMMANDS',
  'PROCESSING...',
  'AI ONLINE',
  'NEURAL CORE ACTIVE',
  'RONIN STANDBY'
];

function setMood(mood: 'neutral' | 'happy' | 'thinking' | 'error', speechText?: string) {
  currentState.value = mood;

  if (mood === 'happy') {
    neonColor.value = '#00ff88';
    mouthPath.value = 'M 43 44 Q 50 51 57 44';
    eyeRadius.value = '5';
  } else if (mood === 'thinking') {
    neonColor.value = '#ffaa00';
    mouthPath.value = 'M 43 47 Q 50 43 57 47';
    eyeRadius.value = '4';
  } else if (mood === 'error') {
    neonColor.value = '#ff0055';
    mouthPath.value = 'M 43 49 Q 50 42 57 49';
    eyeRadius.value = '3.5';
  } else {
    neonColor.value = '#00f0ff';
    mouthPath.value = 'M 43 46 Q 50 46 57 46';
    eyeRadius.value = '4.5';
  }

  if (speechText) {
    petSpeech.value = speechText;
    showSpeech.value = true;
    if (speechTimeout) clearTimeout(speechTimeout);
    speechTimeout = setTimeout(() => {
      showSpeech.value = false;
    }, 3000);
  }
}

function handlePetClick() {
  const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
  isExternal = true;
  setMood('happy', randomPhrase);

  if (externalTimeout) clearTimeout(externalTimeout);
  externalTimeout = setTimeout(() => {
    isExternal = false;
    setMood('neutral');
  }, 3500);
}

function onPetStateEvent(e: any) {
  const state = e.detail?.state;
  if (!state) return;

  isExternal = true;
  if (state === 'thinking') {
    setMood('thinking', 'PROCESSING...');
  } else if (state === 'happy') {
    setMood('happy', 'COMPLETED!');
  } else if (state === 'error') {
    setMood('error', 'ERROR DETECTED');
  } else {
    setMood('neutral');
    isExternal = false;
  }

  if (externalTimeout) clearTimeout(externalTimeout);
  externalTimeout = setTimeout(() => {
    isExternal = false;
    setMood('neutral');
  }, 4000);
}

onMounted(() => {
  window.addEventListener('pet-state-change', onPetStateEvent);

  randomTimer = setInterval(() => {
    if (isExternal) return;
    const r = Math.random();
    if (r < 0.6) {
      setMood('neutral');
    } else if (r < 0.85) {
      setMood('thinking');
    } else {
      setMood('happy');
    }
  }, 8000);
});

onUnmounted(() => {
  window.removeEventListener('pet-state-change', onPetStateEvent);
  if (randomTimer) clearInterval(randomTimer);
  if (speechTimeout) clearTimeout(speechTimeout);
  if (externalTimeout) clearTimeout(externalTimeout);
});
</script>

<template>
  <div class="pet-widget" @click="handlePetClick" title="CLICK ME!">
    <transition name="fade">
      <div v-if="showSpeech" class="pet-speech-bubble">
        {{ petSpeech }}
      </div>
    </transition>

    <svg
      id="robot-pet-svg"
      class="robot-pet"
      viewBox="0 0 100 100"
      :style="{ '--glow-color': neonColor }"
    >
      <!-- Shadows & Glow Filter -->
      <defs>
        <filter id="pet-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Antenna -->
      <line x1="50" y1="20" x2="50" y2="10" stroke="#445566" stroke-width="3" stroke-linecap="round" />
      <circle
        cx="50"
        cy="8"
        r="4"
        :fill="neonColor"
        class="pet-antenna-glow"
        filter="url(#pet-glow)"
      />

      <!-- Body / Chassis -->
      <rect x="30" y="55" width="40" height="30" rx="8" fill="#151c2e" stroke="#2c3b59" stroke-width="2" />
      <!-- Belly Screen/LED -->
      <rect
        x="38"
        y="62"
        width="24"
        height="16"
        rx="4"
        :fill="neonColor"
        class="pet-belly-led"
        opacity="0.25"
      />
      <circle cx="50" cy="70" r="3" :fill="neonColor" filter="url(#pet-glow)" />

      <!-- Head Chassis -->
      <rect x="25" y="20" width="50" height="35" rx="10" fill="#111625" stroke="#2c3b59" stroke-width="2" />
      <!-- Head Visor Screen -->
      <rect x="32" y="27" width="36" height="22" rx="6" fill="#070a12" />

      <!-- Eyes -->
      <circle
        cx="41"
        cy="36"
        :r="eyeRadius"
        :fill="neonColor"
        class="pet-eye"
        filter="url(#pet-glow)"
      />
      <circle
        cx="59"
        cy="36"
        :r="eyeRadius"
        :fill="neonColor"
        class="pet-eye"
        filter="url(#pet-glow)"
      />

      <!-- Mouth (Dynamic SVG Path) -->
      <path
        :d="mouthPath"
        fill="none"
        :stroke="neonColor"
        stroke-width="2"
        stroke-linecap="round"
        filter="url(#pet-glow)"
      />

      <!-- Ears / Audio Sensors -->
      <rect x="20" y="30" width="5" height="15" rx="2" fill="#2c3b59" />
      <rect x="75" y="30" width="5" height="15" rx="2" fill="#2c3b59" />

      <!-- Limbs -->
      <line x1="26" y1="62" x2="16" y2="72" stroke="#445566" stroke-width="3" stroke-linecap="round" />
      <circle cx="16" cy="72" r="3" :fill="neonColor" class="pet-joint" />

      <line x1="74" y1="62" x2="84" y2="72" stroke="#445566" stroke-width="3" stroke-linecap="round" />
      <circle cx="84" cy="72" r="3" :fill="neonColor" class="pet-joint" />

      <!-- Feet -->
      <rect x="34" y="85" width="12" height="6" rx="3" fill="#2c3b59" />
      <rect x="54" y="85" width="12" height="6" rx="3" fill="#2c3b59" />
    </svg>
  </div>
</template>

<style scoped>
.pet-widget {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  width: 90px;
  height: 90px;
  user-select: none;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pet-widget:hover {
  transform: scale(1.1);
}

.robot-pet {
  width: 80px;
  height: 80px;
  filter: drop-shadow(0 0 6px var(--glow-color, rgba(0, 240, 255, 0.4)));
  transition: filter 0.3s ease;
}

.pet-speech-bubble {
  position: absolute;
  top: -28px;
  background: var(--cyber-emerald-dark, #02141d);
  border: 1px solid var(--cyber-cyan-500, #00f0ff);
  color: var(--cyber-cyan-300, #87eaf2);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 0 10px rgba(0, 240, 255, 0.3);
  z-index: 10;
}

.pet-speech-bubble::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 4px solid var(--cyber-cyan-500, #00f0ff);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
