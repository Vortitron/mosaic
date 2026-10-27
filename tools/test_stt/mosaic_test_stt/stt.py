import logging
from collections.abc import AsyncIterable

from homeassistant.components.stt import (
    AudioBitRates, AudioChannels, AudioCodecs, AudioFormats, AudioSampleRates,
    SpeechMetadata, SpeechResult, SpeechResultState, SpeechToTextEntity,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([TestSTT()])


class TestSTT(SpeechToTextEntity):
    _attr_name = "Mosaic test STT"
    _attr_unique_id = "mosaic_test_stt"
    last_bytes = 0

    @property
    def supported_languages(self): return ["en"]
    @property
    def supported_formats(self): return [AudioFormats.WAV]
    @property
    def supported_codecs(self): return [AudioCodecs.PCM]
    @property
    def supported_bit_rates(self): return [AudioBitRates.BITRATE_16]
    @property
    def supported_sample_rates(self): return [AudioSampleRates.SAMPLERATE_16000]
    @property
    def supported_channels(self): return [AudioChannels.CHANNEL_MONO]

    async def async_process_audio_stream(self, metadata: SpeechMetadata, stream: AsyncIterable[bytes]) -> SpeechResult:
        n = 0
        async for chunk in stream:
            n += len(chunk)
        _LOGGER.warning("mosaic_test_stt received %d bytes of audio", n)
        if n < 16000:  # under half a second of 16 kHz 16-bit audio
            return SpeechResult(None, SpeechResultState.ERROR)
        return SpeechResult(f"turn on the kitchen lights ({n} bytes)", SpeechResultState.SUCCESS)
