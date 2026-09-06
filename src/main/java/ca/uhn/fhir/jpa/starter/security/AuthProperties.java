package ca.uhn.fhir.jpa.starter.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration for the simple Bearer-token authentication layer.
 *
 * <p>Bound from the {@code hapi.auth.*} block in {@code application.yaml}. All values can be
 * overridden by environment variables (e.g. {@code HAPI_AUTH_PASSWORD}) so that credentials never
 * have to be committed to source control.
 */
@ConfigurationProperties(prefix = "hapi.auth")
public class AuthProperties {

	/** Master switch. When {@code false} the security filter chain permits everything. */
	private boolean enabled = true;

	/** The single administrative username accepted by {@code POST /auth/login}. */
	private String username = "admin";

	/** The password for {@link #username}. Override via the {@code HAPI_AUTH_PASSWORD} env var. */
	private String password = "admin123";

	/**
	 * Lifetime of an issued token, in seconds. A value {@code <= 0} means the token never expires
	 * (until the server restarts or the token is explicitly revoked via logout).
	 */
	private long tokenValiditySeconds = 3600;

	public boolean isEnabled() {
		return enabled;
	}

	public void setEnabled(boolean enabled) {
		this.enabled = enabled;
	}

	public String getUsername() {
		return username;
	}

	public void setUsername(String username) {
		this.username = username;
	}

	public String getPassword() {
		return password;
	}

	public void setPassword(String password) {
		this.password = password;
	}

	public long getTokenValiditySeconds() {
		return tokenValiditySeconds;
	}

	public void setTokenValiditySeconds(long tokenValiditySeconds) {
		this.tokenValiditySeconds = tokenValiditySeconds;
	}
}
