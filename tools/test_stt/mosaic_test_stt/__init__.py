"""A speech-to-text engine for testing Mosaic's microphone: it takes what a
real Assist pipeline sends (mono 16 kHz PCM) and answers with a fixed
sentence once enough audio has arrived."""
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    await hass.config_entries.async_forward_entry_setups(entry, [Platform.STT])
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, [Platform.STT])
