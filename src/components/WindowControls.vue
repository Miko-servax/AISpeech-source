<script setup lang="ts">
import {useVehicleStore} from '../stores/vehicle';
import {windowIds,windowConfig} from '../config/v8-windows';
defineProps<{ready:boolean}>();const store=useVehicleStore();
</script>
<template><section><h2>车窗控制</h2><p>左右以车辆自身为准 · 0%关闭，100%打开</p><fieldset :disabled="!ready"><legend class="sr-only">四窗控制</legend>
          <div class="presets"><button @click="store.setAll(0)">全部关闭</button><button @click="store.setAll(0.5)">全部半开</button><button @click="store.setAll(1)">全部打开</button></div>
          <div class="window-list"><article v-for="id in windowIds" :key="id" class="window-card" :class="{ selected:store.selected===id }">
            <button class="window-heading" @click="store.selectWindow(id)"><span><small>{{ id }}</small>{{ windowConfig[id].label }}</span><strong>{{ Math.round(store.windows[id].current*100) }}<em>%</em></strong></button>
            <input @pointerdown="store.beginSlider()" @change="store.endSlider()" @blur="store.endSlider()" @pointercancel="store.endSlider()" type="range" min="0" max="100" step="1" :aria-label="windowConfig[id].label+'开度'" :value="store.windows[id].target*100" @input="store.setWindow(id,Number(($event.target as HTMLInputElement).value)/100,'slider')">
            <div class="window-actions"><button @click="store.setWindow(id,0)">全关</button><button @click="store.setWindow(id,0.5)">半开</button><button @click="store.setWindow(id,1)">全开</button><span>目标 {{ Math.round(store.windows[id].target*100) }}%</span></div>
          </article></div>
</fieldset></section></template>