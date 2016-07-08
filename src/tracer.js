'use strict';

import Span from './span';
import SpanContext from './span_context';
import Constants from './constants';

/**
 * Tracer is the entry-point between the instrumentation API and the tracing
 * implementation.
 *
 * The default object acts as a no-op implementation.
 */
export default class Tracer {

    // ---------------------------------------------------------------------- //
    // OpenTracing API methods
    // ---------------------------------------------------------------------- //

    /**
     * Starts and returns a new Span representing a logical unit of work.
     *
     * For example:
     *
     *     // Start a new (parentless) root Span:
     *     var parent = Tracer.startSpan('DoWork');
     *
     *     // Start a new (child) Span:
     *     var child = Tracer.startSpan('Subroutine', {
     *         reference: Tracer.childOf(parent.context()),
     *     });
     *
     * @param {string|object} nameOrFields - if the given argument is a
     *        string, it is the name of the operation and the second `fields`
     *        argument is optional. If it is an object, it is treated as the
     *        fields argument and a second argument should not be provided.
     * @param {object} [fields] - the fields to set on the newly created span.
     * @param {string} [fields.operationName] - the name to use for the newly
     *        created span. Required if called with a single argument.
     * @param {SpanContext} [fields.reference] - a single Reference instance
     *        pointing to a causal parent SpanContext. If specified,
     *        `fields.references` must be unspecified.
     * @param {array} [fields.references] - an array of Reference instances,
     *        each pointing to a causal parent SpanContext. If specified,
     *        `fields.reference` must be unspecified.
     * @param {object} [fields.tags] - set of key-value pairs which will be set
     *        as tags on the newly created Span. Ownership of the object is
     *        passed to the created span for efficiency reasons (the caller
     *        should not modify this object after calling startSpan).
     * @param {number} [fields.startTime] - a manually specified start time for
     *        the created Span object. The time should be specified in
     *        milliseconds as Unix timestamp. Decimal value are supported
     *        to represent time values with sub-millisecond accuracy.
     * @return {Span} - a new Span object.
     */
    startSpan(nameOrFields, fields) {
        if (API_CONFORMANCE_CHECKS) {
            if (arguments.length > 2) {
                throw new Error('Invalid number of arguments.');
            }
            if (typeof nameOrFields !== 'string' && typeof nameOrFields !== 'object') {
                throw new Error('argument expected to be a string or object');
            }
            if (typeof nameOrFields === 'string' && nameOrFields.length === 0) {
                throw new Error('operation name cannot be length zero');
            }
            if (typeof nameOrFields === 'object') {
                if (arguments.length !== 1) {
                    throw new Error('Unexpected number of arguments');
                }
                if (nameOrFields === null) {
                    throw new Error('fields should not be null');
                }
                if (!nameOrFields.operationName) {
                    throw new Error('operationName is a required parameter');
                }
            }
        }

        let spanImp = null;
        if (this._imp) {
            // Normalize the argument so the implementation is always provided
            // an associative array of fields.
            if (arguments.length === 1) {
                if (typeof nameOrFields === 'string') {
                    fields = {
                        operationName : nameOrFields,
                    };
                } else {
                    fields = nameOrFields;
                }
            } else {
                fields.operationName = nameOrFields;
            }
            if (API_CONFORMANCE_CHECKS && fields.reference && fields.references) {
                throw new Error('At most one of `reference` and ' +
                    '`references` may be specified');
            }

            spanImp = this._imp.startSpan(fields);
        }
        return new Span(spanImp);
    }

    /**
     * Injects the given SpanContext instance for cross-process propagation
     * within `carrier`. The expected type of `carrier` depends on the value of
     * `format.
     *
     * OpenTracing defines a common set of `format` values (see FORMAT_TEXT_MAP
     * and FORMAT_BINARY), and each has an expected carrier type.
     *
     * Consider this pseudocode example:
     *
     *     var clientSpan = ...;
     *     ...
     *     // Inject clientSpan into a text carrier.
     *     var textCarrier = {};
     *     Tracer.inject(clientSpan.context(), Tracer.FORMAT_TEXT_MAP, textCarrier);
     *     // Incorporate the textCarrier into the outbound HTTP request header
     *     // map.
     *     outboundHTTPReq.headers.extend(textCarrier);
     *     // ... send the httpReq
     *
     * For FORMAT_BINARY, inject() will set the buffer field to an Array-like
     * (Array, ArrayBuffer, or TypedBuffer) object containing the injected
     * binary data.  Any valid Object can be used as long as the buffer field of
     * the object can be set.
     *
     * @param  {SpanContext} spanContext - the SpanContext to inject into the
     *         carrier object.
     * @param  {string} format - the format of the carrier.
     * @param  {any} carrier - see the documentation for the chosen `format`
     *         for a description of the carrier object.
     */
    inject(spanContext, format, carrier) {
        if (API_CONFORMANCE_CHECKS) {
            if (arguments.length !== 3) {
                throw new Error('Invalid number of arguments.');
            }
            if (!(spanContext instanceof SpanContext)) {
                throw new Error('Expected SpanContext object as first argument');
            }
            if (typeof format !== 'string') {
                throw new Error(`format expected to be a string. Found: ${typeof format}`);
            }
            if (format === Constants.FORMAT_TEXT_MAP && typeof carrier !== 'object') {
                throw new Error('Unexpected carrier object for TEXT_MAP format');
            }
            if (format === Constants.FORMAT_BINARY && typeof carrier !== 'object') {
                throw new Error('Unexpected carrier object for BINARY format');
            }
        }

        if (this._imp) {
            this._imp.inject(spanContext._imp, format, carrier);
        }
    }

    /**
     * Returns a SpanContext instance extracted from `carrier` in the given
     * `format`.
     *
     * OpenTracing defines a common set of `format` values (see FORMAT_TEXT_MAP
     * and FORMAT_BINARY), and each has an expected carrier type.
     *
     * Consider this pseudocode example:
     *
     *     // Use the inbound HTTP request's headers as a text map carrier.
     *     var textCarrier = inboundHTTPReq.headers;
     *     var wireCtx = Tracer.extract(Tracer.FORMAT_TEXT_MAP, textCarrier);
     *     var serverSpan = Tracer.startSpan('...', Tracer.childOf(wireCtx));
     *
     * For FORMAT_BINARY, `carrier` is expected to have a field named `buffer`
     * that contains an Array-like object (Array, ArrayBuffer, or TypedBuffer).
     *
     * @param  {string} format - the format of the carrier.
     * @param  {any} carrier - the type of the carrier object is determined by
     *         the format.
     * @return {SpanContext}
     */
    extract(format, carrier) {
        if (API_CONFORMANCE_CHECKS) {
            if (arguments.length !== 2) {
                throw new Error('Invalid number of arguments.');
            }
            if (typeof format !== 'string' || !format.length) {
                throw new Error('format is expected to be a string of non-zero length');
            }
            if (format === Constants.FORMAT_TEXT_MAP && !(typeof carrier === 'object')) {
                throw new Error('Unexpected carrier object for FORMAT_TEXT_MAP');
            }
            if (format === Constants.FORMAT_BINARY) {
                if (carrier.buffer !== undefined && typeof carrier.buffer !== 'object') {
                    throw new Error('Unexpected carrier object for FORMAT_BINARY');
                }
            }
        }
        let spanContextImp = null;
        if (this._imp) {
            spanContextImp = this._imp.extract(format, carrier);
        }
        return new SpanContext(spanContextImp);
    }

    /**
     * Request that any buffered or in-memory data is flushed out of the process.
     *
     * @param {function(err: objectg)} done - optional callback function with
     *        the signature `function(err)` that will be called as soon as the
     *        flush completes. `err` should be null or undefined if the flush
     *        was successful.
     */
    flush(done) {
        if (API_CONFORMANCE_CHECKS) {
            if (arguments.length > 1) {
                throw new Error('Invalid number of arguments');
            }
            if (done !== undefined && typeof done !== 'function') {
                throw new Error('callback expected to be a function');
            }
        }
        if (!this._imp) {
            done(null);
            return;
        }
        this._imp.flush(done);
    }


    // ---------------------------------------------------------------------- //
    // Private and non-standard methods
    // ---------------------------------------------------------------------- //

    /**
     * Note: this constructor should not be called directly by consumers of this
     * code. The singleton's initNewTracer() method should be invoked instead.
     */
    constructor(imp) {
        this._imp = imp || null;
    }

    /**
     * Handle to implementation object.
     *
     * Use of this method is discouraged as it greatly reduces the portability of
     * the calling code. Use only when implementation-specific functionality must
     * be used and cannot accessed otherwise.
     *
     * @return {object}
     *         An implementation-dependent object.
     */
    imp() {
        return this._imp;
    }
}
