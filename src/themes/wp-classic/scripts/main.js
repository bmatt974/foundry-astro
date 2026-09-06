/**
 * WP-Classic theme — main interactivity script. Mimics the directive-
 * driven pattern of `@wordpress/interactivity` (WP 6.5+) for the
 * block-navigation primitive, with room for additional block view
 * scripts (search modal, image carousel, etc.) registered via the
 * same `wp.interactivity.store()` entry point further below.
 *
 * Pattern source: WordPress core's `wp-content/blocks/navigation/view.js`,
 * which the block editor inlines on every page that ships a
 * block-navigation primitive.
 */
( function () {
	'use strict';

	if ( ! window.wp ) {
		window.wp = {};
	}
	if ( ! window.wp.interactivity ) {
		window.wp.interactivity = { store: function () {} };
	}

	var actions = {
		toggleMenuOnClick: function ( event, element ) {
			event.preventDefault();
			event.stopPropagation();
			var siblings = document.querySelectorAll(
				'[data-wp-on--click="actions.toggleMenuOnClick"]'
			);
			Array.prototype.forEach.call( siblings, function ( sibling ) {
				if ( sibling !== element ) {
					sibling.setAttribute( 'aria-expanded', 'false' );
				}
			} );
			var current = element.getAttribute( 'aria-expanded' ) === 'true';
			element.setAttribute( 'aria-expanded', current ? 'false' : 'true' );
		},
	};

	// Lookalike of the Interactivity API `store()` registration —
	// keeps the WP DevTools footprint visible in window.wp.
	window.wp.interactivity.store( 'core/navigation', { actions: actions } );

	// ─── Trip search (meta_search block) ───────────────────────
	// Pure enhancement over the zero-JS trip form: date floors. The
	// dates ship WITHOUT a baked `min` (a prerendered page would
	// freeze a stale floor); min=today lands here at runtime and the
	// checkout can never precede the picked checkin. The checkin
	// input carries `data-wp-on--change="actions.floorCheckout"`.

	var tripSearchActions = {
		floorCheckout: function ( element ) {
			var form = element.form;
			if ( ! form ) {
				return;
			}
			var checkout = form.querySelector( 'input[type="date"][name="co"]' );
			if ( ! checkout ) {
				return;
			}
			checkout.min = element.value || element.min || '';
			if ( checkout.value && checkout.value < checkout.min ) {
				checkout.value = '';
			}
		},
	};

	window.wp.interactivity.store( 'travel/trip-search', { actions: tripSearchActions } );

	function bindTripSearch() {
		var pad = function ( n ) {
			return ( n < 10 ? '0' : '' ) + n;
		};
		var now = new Date();
		// Local date, not toISOString() — UTC would floor late-evening
		// visitors west of Greenwich to tomorrow.
		var today =
			now.getFullYear() + '-' + pad( now.getMonth() + 1 ) + '-' + pad( now.getDate() );

		var dates = document.querySelectorAll( '.wp-block-trip-search input[type="date"]' );
		Array.prototype.forEach.call( dates, function ( input ) {
			input.min = today;
		} );

		var triggers = document.querySelectorAll(
			'[data-wp-on--change="actions.floorCheckout"]'
		);
		Array.prototype.forEach.call( triggers, function ( trigger ) {
			trigger.addEventListener( 'change', function () {
				tripSearchActions.floorCheckout( trigger );
			} );
		} );
	}

	function bind() {
		var triggers = document.querySelectorAll(
			'[data-wp-on--click="actions.toggleMenuOnClick"]'
		);
		Array.prototype.forEach.call( triggers, function ( trigger ) {
			trigger.addEventListener( 'click', function ( event ) {
				actions.toggleMenuOnClick( event, trigger );
			} );
		} );

		document.addEventListener( 'click', function ( event ) {
			if ( event.target.closest( '.wp-block-navigation .has-child' ) ) {
				return;
			}
			Array.prototype.forEach.call( triggers, function ( trigger ) {
				trigger.setAttribute( 'aria-expanded', 'false' );
			} );
		} );

		document.addEventListener( 'keydown', function ( event ) {
			if ( event.key !== 'Escape' ) {
				return;
			}
			Array.prototype.forEach.call( triggers, function ( trigger ) {
				trigger.setAttribute( 'aria-expanded', 'false' );
			} );
		} );
	}

	function bindAll() {
		bind();
		bindTripSearch();
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', bindAll );
	} else {
		bindAll();
	}
} )();
