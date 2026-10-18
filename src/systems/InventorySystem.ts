import { world } from '../world';
import type { InventoryItem } from '../world';
import { sound } from '../audio/SoundPlayer';

const MAX_INVENTORY = 8;

let inventoryOpen = false;

export function isInventoryOpen(): boolean { return inventoryOpen; }

export function updateInventory(): void {
  for (const player of world.with('position', 'playerInput', 'inventory', 'health')) {
    const pi = player.playerInput!;

    if (pi.intents.inventoryOpen) {
      pi.intents.inventoryOpen = false;
      inventoryOpen = !inventoryOpen;
    }

    if (!inventoryOpen) continue;

    // Use item from hotkey or inventoryUse intent
    if (pi.intents.inventoryUse) {
      pi.intents.inventoryUse = false;
      const inv = player.inventory!;
      if (inv.length > 0) {
        const item = inv[0];
        applyItem(player as Parameters<typeof applyItem>[0], item);
        inv.splice(0, 1);
      }
    }

    // Auto-pickup nearby items
    const pos = player.position!;
    for (const itemEntity of world.with('position', 'item')) {
      if (itemEntity.removed) continue;
      const ip = itemEntity.position!;
      if (Math.hypot(ip.x - pos.x, ip.y - pos.y) > 20) continue;
      const inv = player.inventory!;
      if (inv.length >= MAX_INVENTORY) continue;
      const item = itemEntity.item!;
      inv.push({ type: item.type, name: item.name, value: item.value });
      sound.playSound('coin', ip.x, ip.y);
      world.addComponent(itemEntity, 'removed', true);
    }
  }
}

import type { Entity } from '../world';

function applyItem(player: Entity, item: InventoryItem): void {
  const h = player.health!;
  const stats = player.playerStats!;
  switch (item.type) {
    case 'health_potion':
      h.current = Math.min(h.max, h.current + item.value);
      sound.playSound('potion');
      break;
    case 'sword_scroll':
      stats.swordTier = Math.min(4, stats.swordTier + 1);
      sound.playSound('level_up');
      break;
    case 'armor_piece':
      stats.armorTier = Math.min(4, stats.armorTier + 1);
      sound.playSound('level_up');
      break;
    case 'mana_potion':
      h.current = Math.min(h.max, h.current + item.value);
      sound.playSound('potion');
      break;
  }
}
