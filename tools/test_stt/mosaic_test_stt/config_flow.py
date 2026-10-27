from homeassistant.config_entries import ConfigFlow


class Flow(ConfigFlow, domain="mosaic_test_stt"):
    async def async_step_user(self, user_input=None):
        return self.async_create_entry(title="Mosaic test speech-to-text", data={})
