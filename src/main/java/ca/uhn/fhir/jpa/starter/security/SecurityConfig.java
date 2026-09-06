package ca.uhn.fhir.jpa.starter.security;

import jakarta.servlet.DispatcherType;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Wires the simple Bearer-token security model.
 *
 * <p>HAPI's {@code RestfulServer} is a raw servlet mapped at {@code /fhir/*}, not a Spring MVC
 * controller, so the only layer that can guard it is the servlet filter chain. Spring Security
 * registers {@code springSecurityFilterChain} as a servlet filter, which runs before dispatch to
 * <em>any</em> servlet — including HAPI's — which is exactly why this works.
 *
 * <p>Public paths: {@code /auth/login}, the web tester UI ({@code /} + assets), Swagger
 * ({@code /fhir/swagger-ui/**}, {@code /fhir/api-docs/**}) and {@code /actuator/health}. Everything
 * else — all FHIR data APIs and {@code /fhir/metadata} — requires a valid token.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(AuthProperties.class)
public class SecurityConfig {

	/** Paths reachable without a token. */
	private static final String[] PUBLIC_PATHS = {
		"/auth/login",
		"/",
		"/actuator/health",
		"/actuator/health/**",
		"/fhir/swagger-ui",
		"/fhir/swagger-ui/**",
		"/fhir/api-docs",
		"/fhir/api-docs/**",
		// Web tester UI + static assets served from the root context
		"/css/**",
		"/js/**",
		"/img/**",
		"/fonts/**",
		"/webjars/**",
		"/favicon.ico"
	};

	private final AuthProperties authProperties;
	private final TokenService tokenService;
	private final RestAuthenticationEntryPoint authenticationEntryPoint;

	public SecurityConfig(
			AuthProperties authProperties,
			TokenService tokenService,
			RestAuthenticationEntryPoint authenticationEntryPoint) {
		this.authProperties = authProperties;
		this.tokenService = tokenService;
		this.authenticationEntryPoint = authenticationEntryPoint;
	}

	@Bean
	public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http.csrf(csrf -> csrf.disable())
				.cors(cors -> {}) // keep HAPI's existing CORS interceptor behaviour
				.sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.formLogin(form -> form.disable())
				.httpBasic(basic -> basic.disable())
				.logout(logout -> logout.disable());

		if (authProperties.isEnabled()) {
			http.authorizeHttpRequests(
							auth ->
									auth
											// Internal FORWARD/ERROR dispatches (e.g. to /error when a
											// permitted page fails) must not be re-authenticated, or the
											// real error gets masked by a misleading 401.
											.dispatcherTypeMatchers(
													DispatcherType.FORWARD, DispatcherType.ERROR)
											.permitAll()
											.requestMatchers(PUBLIC_PATHS)
											.permitAll()
											.anyRequest()
											.authenticated())
					.exceptionHandling(ex -> ex.authenticationEntryPoint(authenticationEntryPoint))
					.addFilterBefore(
							new TokenAuthFilter(tokenService),
							UsernamePasswordAuthenticationFilter.class);
		} else {
			// Auth disabled via configuration: let everything through.
			http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
		}

		return http.build();
	}
}
