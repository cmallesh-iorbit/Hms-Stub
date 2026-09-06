package ca.uhn.fhir.jpa.starter.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Extracts the {@code Authorization: Bearer <token>} header and, if the token is valid, populates
 * the {@link SecurityContextHolder} with an authenticated principal.
 *
 * <p>This filter never rejects a request itself. If the token is missing or invalid it simply
 * leaves the security context empty; Spring Security's authorization rules then decide whether the
 * target path requires authentication, and {@link RestAuthenticationEntryPoint} produces the 401.
 * This keeps a single, consistent place for rejection logic and lets public paths through.
 */
public class TokenAuthFilter extends OncePerRequestFilter {

	private static final String BEARER_PREFIX = "Bearer ";

	private final TokenService tokenService;

	public TokenAuthFilter(TokenService tokenService) {
		this.tokenService = tokenService;
	}

	@Override
	protected void doFilterInternal(
			HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
			throws ServletException, IOException {

		// Only attempt authentication if we haven't already authenticated this request.
		if (SecurityContextHolder.getContext().getAuthentication() == null) {
			extractToken(request)
					.flatMap(tokenService::validate)
					.ifPresent(username -> authenticate(username, request));
		}

		filterChain.doFilter(request, response);
	}

	private Optional<String> extractToken(HttpServletRequest request) {
		String header = request.getHeader(HttpHeaders.AUTHORIZATION);
		if (header != null && header.startsWith(BEARER_PREFIX)) {
			return Optional.of(header.substring(BEARER_PREFIX.length()).trim());
		}
		return Optional.empty();
	}

	private void authenticate(String username, HttpServletRequest request) {
		var authorities = List.of(new SimpleGrantedAuthority("ROLE_USER"));
		var authentication = new UsernamePasswordAuthenticationToken(username, null, authorities);
		authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
		SecurityContextHolder.getContext().setAuthentication(authentication);
	}
}
