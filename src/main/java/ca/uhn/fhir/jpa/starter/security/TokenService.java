package ca.uhn.fhir.jpa.starter.security;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/**
 * Issues, validates and revokes opaque Bearer tokens.
 *
 * <p>Tokens are 256 bits of {@link SecureRandom} entropy, Base64-URL encoded. They are
 * <em>opaque</em> — they carry no decodable information (unlike a JWT); the server is the sole
 * source of truth. State is held in an in-memory {@link ConcurrentHashMap}, which means:
 *
 * <ul>
 *   <li>tokens are lost on restart (clients simply log in again), and</li>
 *   <li>tokens are <strong>not</strong> shared across multiple server instances.</li>
 * </ul>
 *
 * <p>For a clustered deployment, replace the map with a shared store (Redis/DB) — the public API of
 * this class is intentionally small to make that swap easy.
 */
@Service
public class TokenService {

	private static final int TOKEN_BYTES = 32; // 256 bits

	private final SecureRandom secureRandom = new SecureRandom();
	private final Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
	private final ConcurrentHashMap<String, TokenRecord> store = new ConcurrentHashMap<>();
	private final AuthProperties authProperties;

	public TokenService(AuthProperties authProperties) {
		this.authProperties = authProperties;
	}

	/**
	 * Generate a fresh token bound to the given username and store it.
	 *
	 * @return the newly issued opaque token
	 */
	public String issue(String username) {
		byte[] bytes = new byte[TOKEN_BYTES];
		secureRandom.nextBytes(bytes);
		String token = encoder.encodeToString(bytes);

		long ttl = authProperties.getTokenValiditySeconds();
		Instant expiresAt = ttl > 0 ? Instant.now().plusSeconds(ttl) : Instant.MAX;
		store.put(token, new TokenRecord(username, expiresAt));
		return token;
	}

	/**
	 * Validate a token. Expired tokens are evicted on access.
	 *
	 * @return the associated username if the token is valid and unexpired, otherwise empty
	 */
	public Optional<String> validate(String token) {
		if (token == null || token.isBlank()) {
			return Optional.empty();
		}
		TokenRecord record = store.get(token);
		if (record == null) {
			return Optional.empty();
		}
		if (record.isExpired()) {
			store.remove(token);
			return Optional.empty();
		}
		return Optional.of(record.username());
	}

	/** Immediately invalidate a token (used by logout). */
	public void revoke(String token) {
		if (token != null) {
			store.remove(token);
		}
	}

	/** The validity window configured for newly issued tokens, in seconds (0 = never expires). */
	public long getTokenValiditySeconds() {
		return authProperties.getTokenValiditySeconds();
	}

	/** A stored token: the owning username and its absolute expiry instant. */
	private record TokenRecord(String username, Instant expiresAt) {
		boolean isExpired() {
			return Instant.now().isAfter(expiresAt);
		}
	}
}
