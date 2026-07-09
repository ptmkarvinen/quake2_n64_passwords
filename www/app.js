/*
    MIT License

    Copyright (c) 2026 ZX497

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core Codec and Encryption Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ0123456789?";
const P_T = [1, 8, 9, 5, 6, 2, 7, 0, 4, 3];

// ─────────────────────────────────────────────────────────────────────────────
// Bit Writing and Scrambling Utilities
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

function readBit(buffer, absBit) {
    const byteIdx = Math.floor(absBit / 8);
    const bitIdx = 7 - (absBit % 8);
    return (buffer[byteIdx] & (1 << bitIdx)) !== 0 ? 1 : 0;
}

function readBits(buffer, startBit, endBit) {
    const size = endBit - startBit + 1;
    let val = 0;
    for (let i = 0; i < size; i++) {
        const absBit = endBit - i;
        const bitVal = readBit(buffer, absBit);
        val |= (bitVal << i);
    }
    return val;
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

    // Clamp health, maxHealth and armor to Quake II N64 physical bitstream limits
    let health = config.currentHealth || 100;
    if (health < 1 || health > 115) {
        health = Math.min(115, Math.max(1, health));
    }

    let maxHealth = config.maxHealth || 100;
    if (maxHealth < 100 || maxHealth > 115) {
        maxHealth = Math.min(115, Math.max(100, maxHealth));
    }

    // Determine armor type first to clamp armor value correctly
    let armorType = 0;
    let armor = config.armor || 0;

    if (armor > 0) {
        const typeOverride = (config.armorType || "").toLowerCase();
        if (typeOverride === "body") {
            armorType = 3;
        } else if (typeOverride === "combat") {
            armorType = 2;
        } else if (typeOverride === "jacket") {
            armorType = 1;
        } else {
            // Auto-detect based on armor value
            if (armor > 150) armorType = 1;      // Jacket Armor (up to 250)
            else if (armor > 100) armorType = 2; // Combat Armor (up to 150)
            else armorType = 3;                  // Body Armor (up to 100)
        }

        // Clamp armor based on armor type limits
        let maxArmorLimit = 250;
        if (armorType === 3) {
            maxArmorLimit = 100;
        } else if (armorType === 2) {
            maxArmorLimit = 150;
        }

        if (armor > maxArmorLimit) {
            armor = maxArmorLimit;
        }
    }

    // 1. Level Index (0..4): level + 9
    writeBits(payload, config.level + 9, 0, 4);

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

    // Backpack
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

    const bullets = Math.min(ammoLimits.bullets, Math.max(0, config.ammo.bullets || 0));
    const shells = Math.min(ammoLimits.shells, Math.max(0, config.ammo.shells || 0));
    const rockets = Math.min(ammoLimits.rockets, Math.max(0, config.ammo.rockets || 0));
    const grenades = Math.min(ammoLimits.grenades, Math.max(0, config.ammo.grenades || 0));
    const cells = Math.min(ammoLimits.cells, Math.max(0, config.ammo.cells || 0));
    const slugs = Math.min(ammoLimits.slugs, Math.max(0, config.ammo.slugs || 0));

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

    return {
        passcode: encode(scramble(payload)),
        payload,
        checksum: sum
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Handler and Event Bindings
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    // Cache selectors
    const elLevel = document.getElementById("level");
    const elDifficulty = document.getElementById("difficulty");

    const elCurrentHealth = document.getElementById("currentHealth");
    const elCurrentHealthVal = document.getElementById("currentHealth-val");
    const elMaxHealth = document.getElementById("maxHealth");
    const elMaxHealthVal = document.getElementById("maxHealth-val");

    const elArmorType = document.getElementById("armorType");
    const elArmor = document.getElementById("armor");
    const elArmorVal = document.getElementById("armor-val");

    const elBackpack = document.getElementById("backpack");

    // Weapons
    const elWps = {
        shotgun: document.getElementById("wp-shotgun"),
        superShotgun: document.getElementById("wp-superShotgun"),
        machinegun: document.getElementById("wp-machinegun"),
        chaingun: document.getElementById("wp-chaingun"),
        grenadeLauncher: document.getElementById("wp-grenadeLauncher"),
        rocketLauncher: document.getElementById("wp-rocketLauncher"),
        hyperblaster: document.getElementById("wp-hyperblaster"),
        railgun: document.getElementById("wp-railgun"),
        bfg: document.getElementById("wp-bfg")
    };

    // Ammo
    const elAmmo = {
        bullets: document.getElementById("ammo-bullets"),
        shells: document.getElementById("ammo-shells"),
        rockets: document.getElementById("ammo-rockets"),
        grenades: document.getElementById("ammo-grenades"),
        cells: document.getElementById("ammo-cells"),
        slugs: document.getElementById("ammo-slugs")
    };

    const elAmmoVals = {
        bullets: document.getElementById("ammo-bullets-val"),
        shells: document.getElementById("ammo-shells-val"),
        rockets: document.getElementById("ammo-rockets-val"),
        grenades: document.getElementById("ammo-grenades-val"),
        cells: document.getElementById("ammo-cells-val"),
        slugs: document.getElementById("ammo-slugs-val")
    };

    // Output selectors
    const elPasscode = document.getElementById("passcode");
    const elCopyBtn = document.getElementById("copy-btn");
    const elDiagPayload = document.getElementById("diag-payload");
    const elDiagChecksum = document.getElementById("diag-checksum");
    const elDiagBits = document.getElementById("diag-bits");

    // Decrypt selectors
    const elDecryptInput = document.getElementById("decrypt-input");
    const elDecryptFeedback = document.getElementById("decrypt-feedback");

    // Recalculate function
    function updateUI() {
        // 1. Gather config
        const config = {
            difficulty: elDifficulty.value,
            level: parseInt(elLevel.value),
            weapons: {
                blaster: true,
                shotgun: elWps.shotgun.checked,
                superShotgun: elWps.superShotgun.checked,
                machinegun: elWps.machinegun.checked,
                chaingun: elWps.chaingun.checked,
                grenadeLauncher: elWps.grenadeLauncher.checked,
                rocketLauncher: elWps.rocketLauncher.checked,
                hyperblaster: elWps.hyperblaster.checked,
                railgun: elWps.railgun.checked,
                bfg: elWps.bfg.checked
            },
            backpack: elBackpack.checked,
            ammo: {
                bullets: parseInt(elAmmo.bullets.value),
                shells: parseInt(elAmmo.shells.value),
                rockets: parseInt(elAmmo.rockets.value),
                grenades: parseInt(elAmmo.grenades.value),
                cells: parseInt(elAmmo.cells.value),
                slugs: parseInt(elAmmo.slugs.value)
            },
            armor: parseInt(elArmor.value),
            armorType: elArmorType.value,
            currentHealth: parseInt(elCurrentHealth.value),
            maxHealth: parseInt(elMaxHealth.value)
        };

        // 2. Generate password
        const result = generatePassword(config);

        // 3. Update DOM passcode
        elPasscode.textContent = result.passcode;

        // 4. Update diagnostics panel
        // Hex bytes payload
        const hexArr = Array.from(result.payload).map(b => b.toString(16).toUpperCase().padStart(2, "0"));
        elDiagPayload.textContent = hexArr.join(" ");

        // Checksum
        elDiagChecksum.textContent = `0x${result.checksum.toString(16).toUpperCase().padStart(2, "0")} (${result.checksum})`;

        // Binary bitstream (MSB-first representation in each byte)
        const bitstream = Array.from(result.payload).map(b => {
            return b.toString(2).padStart(8, "0");
        }).join(" ");
        elDiagBits.textContent = bitstream;
    }

    // Handle range updates
    function bindRange(slider, labelEl) {
        slider.addEventListener("input", () => {
            labelEl.textContent = slider.value;
            updateUI();
        });
    }

    bindRange(elCurrentHealth, elCurrentHealthVal);
    bindRange(elMaxHealth, elMaxHealthVal);
    bindRange(elArmor, elArmorVal);

    Object.keys(elAmmo).forEach(k => {
        bindRange(elAmmo[k], elAmmoVals[k]);
    });

    // Handle armor limits based on type selection
    elArmorType.addEventListener("change", () => {
        const type = elArmorType.value;
        if (type === "none") {
            elArmor.value = 0;
            elArmor.max = 0;
            elArmor.disabled = true;
        } else if (type === "jacket") {
            elArmor.max = 250;
            elArmor.disabled = false;
        } else if (type === "combat") {
            elArmor.max = 150;
            elArmor.disabled = false;
        } else if (type === "body") {
            elArmor.max = 100;
            elArmor.disabled = false;
        }

        // Clamp existing slider value to new max limit
        if (parseInt(elArmor.value) > parseInt(elArmor.max)) {
            elArmor.value = elArmor.max;
        }

        elArmorVal.textContent = elArmor.value;
        updateUI();
    });

    // Dynamic limits for ammo based on backpack checkbox
    function updateAmmoSlidersLimit() {
        const hasBackpack = elBackpack.checked;
        const limits = {
            bullets: hasBackpack ? 300 : 200,
            shells: hasBackpack ? 200 : 100,
            rockets: hasBackpack ? 100 : 50,
            grenades: hasBackpack ? 100 : 50,
            cells: hasBackpack ? 300 : 200,
            slugs: hasBackpack ? 100 : 50
        };

        Object.keys(elAmmo).forEach(k => {
            const slider = elAmmo[k];
            const max = limits[k];
            const prevVal = parseInt(slider.value) || 0;
            slider.max = max;
            if (prevVal > max) {
                slider.value = max;
            }
            elAmmoVals[k].textContent = slider.value;
        });
    }

    // Handle select and checkbox updates
    elLevel.addEventListener("change", updateUI);
    elDifficulty.addEventListener("change", updateUI);
    elBackpack.addEventListener("change", () => {
        updateAmmoSlidersLimit();
        updateUI();
    });

    Object.keys(elWps).forEach(k => {
        elWps[k].addEventListener("change", updateUI);
    });

    // Clipboard feature
    elCopyBtn.addEventListener("click", () => {
        const code = elPasscode.textContent;
        if (code && code !== "---- ---- ---- ----") {
            navigator.clipboard.writeText(code).then(() => {
                elCopyBtn.textContent = "COPIED TO CLIPBOARD!";
                elCopyBtn.classList.add("success");

                setTimeout(() => {
                    elCopyBtn.textContent = "COPY TO CLIPBOARD";
                    elCopyBtn.classList.remove("success");
                }, 1500);
            }).catch(err => {
                console.error("Clipboard copy failed:", err);
            });
        }
    });

    // Handle dynamic passcode decryption input
    elDecryptInput.addEventListener("input", () => {
        let rawVal = elDecryptInput.value.replace(/\s+/g, "").toUpperCase();

        // Auto-format with spaces while typing
        let formatted = "";
        for (let i = 0; i < rawVal.length; i++) {
            if (i > 0 && i % 4 === 0) formatted += " ";
            formatted += rawVal[i];
        }

        // Preserve selection start to avoid cursor jumping
        const selectionStart = elDecryptInput.selectionStart;
        const prevLen = elDecryptInput.value.length;
        elDecryptInput.value = formatted;

        // Adjust cursor position if formatting added spaces
        if (selectionStart && elDecryptInput.value.length > prevLen) {
            elDecryptInput.setSelectionRange(selectionStart + 1, selectionStart + 1);
        }

        // Clear feedback message on blank
        if (rawVal.length === 0) {
            elDecryptFeedback.textContent = "";
            elDecryptFeedback.className = "feedback-msg";
            return;
        }

        // Validate characters
        for (let char of rawVal) {
            if (!ALPHABET.includes(char)) {
                elDecryptFeedback.textContent = "INVALID CHARACTERS DETECTED";
                elDecryptFeedback.className = "feedback-msg error";
                return;
            }
        }

        if (rawVal.length < 16) {
            elDecryptFeedback.textContent = `DECRYPTING... (${rawVal.length}/16)`;
            elDecryptFeedback.className = "feedback-msg";
            return;
        }

        if (rawVal.length > 16) {
            elDecryptFeedback.textContent = "PASSCODE IS TOO LONG (MAX 16 CHARS)";
            elDecryptFeedback.className = "feedback-msg error";
            return;
        }

        // Execute Decryption!
        try {
            const decPayload = decode(rawVal);

            // Checksum Validation
            let sum = 0;
            for (let i = 0; i < 9; i++) {
                sum = (sum + decPayload[i]) & 0xFF;
            }

            if (sum !== decPayload[9]) {
                elDecryptFeedback.textContent = `CHECKSUM ERROR: EXPECTED 0x${decPayload[9].toString(16).toUpperCase()} BUT GOT 0x${sum.toString(16).toUpperCase()}`;
                elDecryptFeedback.className = "feedback-msg error";
                return;
            }

            // Sync controls!

            // 1. Level Index (0..4): level + 9
            const rawLvl = readBits(decPayload, 0, 4);
            const levelVal = rawLvl - 9;
            if (levelVal >= 1 && levelVal <= 19) {
                elLevel.value = levelVal;
            }

            // 2. Difficulty (5..6)
            const rawDiff = readBits(decPayload, 5, 6);
            elDifficulty.value = rawDiff === 0 ? "easy" : (rawDiff === 1 ? "normal" : "hard");

            // 3. Weapons (7..15)
            elWps.shotgun.checked = readBits(decPayload, 7, 7) === 1;
            elWps.superShotgun.checked = readBits(decPayload, 8, 8) === 1;
            elWps.machinegun.checked = readBits(decPayload, 9, 9) === 1;
            elWps.chaingun.checked = readBits(decPayload, 10, 10) === 1;
            elWps.grenadeLauncher.checked = readBits(decPayload, 11, 11) === 1;
            elWps.rocketLauncher.checked = readBits(decPayload, 12, 12) === 1;
            elWps.hyperblaster.checked = readBits(decPayload, 13, 13) === 1;
            elWps.railgun.checked = readBits(decPayload, 14, 14) === 1;
            elWps.bfg.checked = readBits(decPayload, 15, 15) === 1;

            // 4. Backpack (16)
            elBackpack.checked = readBits(decPayload, 16, 16) === 1;

            // 5. Health (17..23)
            const hpVal = readBits(decPayload, 17, 23);
            elCurrentHealth.value = hpVal;
            elCurrentHealthVal.textContent = hpVal;

            // 6. Max Health (24..27)
            const maxHpOffset = readBits(decPayload, 24, 27);
            const maxHpVal = maxHpOffset + 100;
            elMaxHealth.value = maxHpVal;
            elMaxHealthVal.textContent = maxHpVal;

            // 7. Armor Type (28..29)
            const armorTypeVal = readBits(decPayload, 28, 29);
            const typeNames = ["none", "jacket", "combat", "body"];
            elArmorType.value = typeNames[armorTypeVal];

            // Re-trigger the armor type change manually to update max slider limits
            const type = elArmorType.value;
            if (type === "none") {
                elArmor.max = 0;
                elArmor.disabled = true;
            } else if (type === "jacket") {
                elArmor.max = 250;
                elArmor.disabled = false;
            } else if (type === "combat") {
                elArmor.max = 150;
                elArmor.disabled = false;
            } else if (type === "body") {
                elArmor.max = 100;
                elArmor.disabled = false;
            }

            // 8. Armor Value (30..35): value * 5
            const armOffset = readBits(decPayload, 30, 35);
            const armVal = armOffset * 5;
            elArmor.value = armVal;
            elArmorVal.textContent = armVal;

            // 9. Ammo Sliders
            updateAmmoSlidersLimit(); // Redefine ammo limits first based on backpack state

            const ammoVals = {
                bullets: readBits(decPayload, 37, 42) * 5,
                shells: readBits(decPayload, 43, 48) * 5,
                rockets: readBits(decPayload, 49, 53) * 5,
                grenades: readBits(decPayload, 54, 58) * 5,
                cells: readBits(decPayload, 59, 64) * 5,
                slugs: readBits(decPayload, 65, 69) * 5
            };

            Object.keys(elAmmo).forEach(k => {
                elAmmo[k].value = ammoVals[k];
                elAmmoVals[k].textContent = ammoVals[k];
            });

            // Display Success Feedback!
            elDecryptFeedback.textContent = "PASSCODE SUCCESSFULLY DECRYPTED & SYNCED";
            elDecryptFeedback.className = "feedback-msg success";

            // Run standard UI update to sync passcode visual block and decrypted data buffer values
            updateUI();
        } catch (err) {
            elDecryptFeedback.textContent = "DECRYPTION SYSTEM ERROR: " + err.message;
            elDecryptFeedback.className = "feedback-msg error";
        }
    });

    // Initialize state
    updateAmmoSlidersLimit();
    updateUI();
});
