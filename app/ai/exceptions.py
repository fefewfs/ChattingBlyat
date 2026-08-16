class ProviderError(Exception):
    def __init__(self, provider: str, code: int, message: str):
        self.provider = provider
        self.code = code
        super().__init__(message)
