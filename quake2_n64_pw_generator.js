#!/usr/bin/env node
/**
 * Quake II (N64) Password Generator
 * 
 * Allows customization of level, difficulty, health, armor, weapons, and ammo.
 */

const CONFIG = {
    difficulty: "easy",     // "easy", "normal", "hard"
    level: 1,                 // -6 (Level 0: Twists) or 1 to 19
    weapons: {
        blaster: true,        // always present
        shotgun: true,
        superShotgun: true,
        machinegun: true,
        chaingun: true,
        grenadeLauncher: true,
        rocketLauncher: true,
        hyperblaster: true,
        railgun: true,
        bfg: true
    },
    backpack: true,
    ammo: {
        shells: 200,
        bullets: 0,
        grenades: 0,
        rockets: 0,
        cells: 0,
        slugs: 0
    },
    armor: 250,                 // 0 to 250
    armorType: "jacket",        // "body", "combat", "jacket"
    currentHealth: 115,       // 1 to 115
    maxHealth: 115            // 100 to 115
};

// ─────────────────────────────────────────────────────────────────────────────
// Core Codec and Encryption Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ0123456789?";
const P_T = [1, 8, 9, 5, 6, 2, 7, 0, 4, 3];

const CHAR_TO_VAL = {};
for (let i = 0; i < ALPHABET.length; i++) {
    CHAR_TO_VAL[ALPHABET[i]] = i;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: Bit Writing, Scrambling, and Encoding
// ─────────────────────────────────────────────────────────────────────────────

function writeBit(buffer, bitVal, absBit) {
    const byteIdx = Math.floor(absBit / 8);
    const bitIdx = 7 - (absBit % 8); // MSB-first bit order within each byte
    if (bitVal) {
        buffer[byteIdx] |= (1 << bitIdx);
    } else {
        buffer[byteIdx] &= ~(1 << bitIdx);
    }
}

function writeBits(buffer, value, startBit, endBit) {
    const size = endBit - startBit + 1;
    for (let i = 0; i < size; i++) {
        // MSB goes to startBit, LSB goes to endBit
        const bitVal = (value >> i) & 1;
        const absBit = endBit - i;
        writeBit(buffer, bitVal, absBit);
    }
}

function scramble(payload) {
    const scrambled = new Uint8Array(payload);
    for (let i = 0; i < 10; i++) {
        scrambled[i] ^= scrambled[P_T[i]];
    }
    return scrambled;
}

function encode(scrambled) {
    let password = "";
    for (let chunk = 0; chunk < 16; chunk++) {
        let val = 0;
        for (let b = 0; b < 5; b++) {
            const absBit = chunk * 5 + b;
            const byteIdx = Math.floor(absBit / 8);
            const bitIdx = absBit % 8;
            const bit = (scrambled[byteIdx] & (0x80 >> bitIdx)) !== 0 ? 1 : 0;
            val = (val << 1) | bit;
        }
        password += ALPHABET[val];
        if ((chunk + 1) % 4 === 0 && chunk < 15) password += " ";
    }
    return password.toUpperCase();
}

function decode(pw) {
    pw = pw.replace(/\s+/g, "").toUpperCase();
    const map = {};
    for (let i = 0; i < ALPHABET.length; i++) map[ALPHABET[i]] = i;
    const vals = pw.split("").map(c => map[c]);
    const bits = [];
    for (let v of vals) {
        for (let b = 4; b >= 0; b--) {
            bits.push((v >> b) & 1);
        }
    }
    const dec = new Uint8Array(10);
    for (let i = 0; i < 10; i++) {
        let byte = 0;
        for (let b = 0; b < 8; b++) {
            byte = (byte << 1) | bits[i * 8 + b];
        }
        dec[i] = byte;
    }
    for (let i = 9; i >= 0; i--) {
        dec[i] ^= dec[P_T[i]];
    }
    return dec;
}

// ─────────────────────────────────────────────────────────────────────────────
// Algorithmic Password Generation
// ─────────────────────────────────────────────────────────────────────────────

function generatePassword(config) {
    const payload = new Uint8Array(10);
    let level = config.level;
    if (level === undefined) level = 1;
    if (level !== -6 && (level < 1 || level > 19)) {
        const clampedLevel = Math.min(19, Math.max(1, level));
        console.warn(`[Warning] Level ${level} is out of bounds. Clamped to ${clampedLevel}.`);
        level = clampedLevel;
    }

    // Clamp health, maxHealth and armor to Quake II N64 physical bitstream limits
    let health = config.currentHealth || 100;
    if (health < 1 || health > 115) {
        const clampedHealth = Math.min(115, Math.max(1, health));
        console.warn(`[Warning] Health ${health} exceeds Quake II N64 limits (1-115). Clamped to ${clampedHealth}.`);
        health = clampedHealth;
    }

    let maxHealth = config.maxHealth || 100;
    if (maxHealth < 100 || maxHealth > 115) {
        const clampedMaxHealth = Math.min(115, Math.max(100, maxHealth));
        console.warn(`[Warning] Max Health ${maxHealth} exceeds Quake II N64 limits (100-115). Clamped to ${clampedMaxHealth}.`);
        maxHealth = clampedMaxHealth;
    }

    if (health > maxHealth) {
        console.warn(`[Warning] Health ${health} exceeds Max Health ${maxHealth}. Clamped to ${maxHealth}.`);
        health = maxHealth;
    }

    // Determine armor type first to clamp armor value correctly
    let armorType = 0;
    let armor = config.armor || 0;

    if (armor > 0) {
        const typeOverride = (config.armorType || "").toLowerCase();
        if (typeOverride === "body" || typeOverride === "body_armor" || typeOverride === "body armor") {
            armorType = 3;
        } else if (typeOverride === "combat" || typeOverride === "combat_armor" || typeOverride === "combat armor") {
            armorType = 2;
        } else if (typeOverride === "jacket" || typeOverride === "jacket_armor" || typeOverride === "jacket armor") {
            armorType = 1;
        } else {
            // Auto-detect based on armor value
            if (armor > 150) armorType = 1;      // Jacket Armor (up to 250)
            else if (armor > 100) armorType = 2; // Combat Armor (up to 150)
            else armorType = 3;                  // Body Armor (up to 100)
        }

        // Clamp armor based on armor type limits
        let maxArmorLimit = 250;
        let armorName = "Jacket";
        if (armorType === 3) {
            maxArmorLimit = 100;
            armorName = "Body";
        } else if (armorType === 2) {
            maxArmorLimit = 150;
            armorName = "Combat";
        }

        if (armor > maxArmorLimit) {
            console.warn(`[Warning] Armor ${armor} exceeds maximum limit for ${armorName} Armor (${maxArmorLimit}). Clamped to ${maxArmorLimit}.`);
            armor = maxArmorLimit;
        }
    }

    // 1. Level Index (0..4): level + 9
    writeBits(payload, level + 9, 0, 4);

    // 2. Difficulty (5..6): easy=0, normal=1, hard=2
    const diffVal = config.difficulty === "easy" ? 0 : (config.difficulty === "normal" ? 1 : 2);
    writeBits(payload, diffVal, 5, 6);

    // 3. Weapons (7..16)
    writeBits(payload, config.weapons.shotgun ? 1 : 0, 7, 7);
    writeBits(payload, config.weapons.superShotgun ? 1 : 0, 8, 8);
    writeBits(payload, config.weapons.machinegun ? 1 : 0, 9, 9);
    writeBits(payload, config.weapons.chaingun ? 1 : 0, 10, 10);
    writeBits(payload, config.weapons.grenadeLauncher ? 1 : 0, 11, 11);
    writeBits(payload, config.weapons.rocketLauncher ? 1 : 0, 12, 12);
    writeBits(payload, config.weapons.hyperblaster ? 1 : 0, 13, 13);
    writeBits(payload, config.weapons.railgun ? 1 : 0, 14, 14);
    writeBits(payload, config.weapons.bfg ? 1 : 0, 15, 15);

    // Backpack is labeled "unknown item" in the game inventory but set here
    writeBits(payload, config.backpack ? 1 : 0, 16, 16);

    // 4. Health (17..23)
    writeBits(payload, health, 17, 23);

    // 5. Max Health Offset (24..27): maxHealth - 100
    writeBits(payload, Math.max(0, maxHealth - 100), 24, 27);

    // 6. Armor Type (28..29)
    writeBits(payload, armorType, 28, 29);

    // 7. Armor Value (30..35): armor / 5
    writeBits(payload, Math.floor(armor / 5), 30, 35);

    // 8. Bit 36: always 0 (skipped)
    writeBits(payload, 0, 36, 36);

    // 9. Ammo (37..69): divided by 5
    const hasBackpack = config.backpack;
    const ammoLimits = {
        bullets: hasBackpack ? 300 : 200,
        shells: hasBackpack ? 200 : 100,
        rockets: hasBackpack ? 100 : 50,
        grenades: hasBackpack ? 100 : 50,
        cells: hasBackpack ? 300 : 200,
        slugs: hasBackpack ? 100 : 50
    };

    const clampAmmo = (val, max, name) => {
        if (val > max) {
            console.warn(`[Warning] ${name} ammo ${val} exceeds limit (${max}). Clamped to ${max}.`);
            return max;
        }
        return Math.max(0, val);
    };

    const bullets = clampAmmo(config.ammo.bullets || 0, ammoLimits.bullets, "Bullets");
    const shells = clampAmmo(config.ammo.shells || 0, ammoLimits.shells, "Shells");
    const rockets = clampAmmo(config.ammo.rockets || 0, ammoLimits.rockets, "Rockets");
    const grenades = clampAmmo(config.ammo.grenades || 0, ammoLimits.grenades, "Grenades");
    const cells = clampAmmo(config.ammo.cells || 0, ammoLimits.cells, "Cells");
    const slugs = clampAmmo(config.ammo.slugs || 0, ammoLimits.slugs, "Slugs");

    writeBits(payload, Math.floor(bullets / 5), 37, 42);
    writeBits(payload, Math.floor(shells / 5), 43, 48);
    writeBits(payload, Math.floor(rockets / 5), 49, 53);
    writeBits(payload, Math.floor(grenades / 5), 54, 58);
    writeBits(payload, Math.floor(cells / 5), 59, 64);
    writeBits(payload, Math.floor(slugs / 5), 65, 69);

    // 10. Checksum (Byte 9): simple sum of Bytes 0 to 8
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum = (sum + payload[i]) & 0xFF;
    }
    payload[9] = sum;

    return encode(scramble(payload));
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Interface
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
    console.log("=========================================");
    console.log("       QUAKE 2 (N64) PASSWORD GENERATOR");
    console.log("=========================================");
    console.log(`Difficulty:     ${CONFIG.difficulty.toUpperCase()}`);
    console.log(`Level:          ${CONFIG.level}`);
    console.log(`Health:         ${CONFIG.currentHealth}/${CONFIG.maxHealth}`);
    console.log(`Armor:          ${CONFIG.armor}`);
    console.log(`Backpack:       ${CONFIG.backpack ? "Yes" : "No"}`);
    console.log("Weapons:        " + Object.keys(CONFIG.weapons).filter(w => CONFIG.weapons[w]).join(", "));
    console.log("Ammo:           " + Object.entries(CONFIG.ammo).map(([k, v]) => `${k}:${v}`).join(", "));
    console.log("-----------------------------------------");
    try {
        const passcode = generatePassword(CONFIG);
        console.log(`GENERATED PASSWORD: \x1b[32m\x1b[1m${passcode}\x1b[0m`);
    } catch (e) {
        console.error("\x1b[31mError:\x1b[0m", e.message);
    }
    console.log("=========================================");
}

module.exports = { generatePassword, decode, encode };
