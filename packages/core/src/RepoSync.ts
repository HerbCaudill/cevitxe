﻿import A from 'automerge'
import debug from 'debug'
import { Map } from 'immutable'
import { Repo } from './Repo'
import { lessOrEqual } from './lib/lessOrEqual'
import { Message } from './types'

type Clock = Map<string, number>
type ClockMap = Map<string, Clock>
type Clocks = { ours: ClockMap; theirs: ClockMap }

const log = debug('cevitxe:docsetsync')

/**
 * One instance of `RepoSync` keeps one local document in sync with one remote peer's replica of
 * the same document.
 *
 * This class works with a local `Repo`; it listens for changes to the document, and if it
 * thinks it has changes that the remote peer doesn't know about, it generates a message to be sent
 * the peer. It also processes messages from its counterpart on the peer, and applies them to the
 * local document as needed.
 *
 * This class doesn't get involved in the actual transmission of the messages; it only generates
 * them for someone else to send, and processes them when someone else receives them. To integrate a
 * connection with a particular networking stack, two functions are used:
 *
 * - `send` (callback passed to the constructor, will be called when local state is updated) takes a
 *   message as argument, and sends it out to the remote peer.
 * - `receive` (method on the connection object) should be called by the network stack when a
 *   message is received from the remote peer.
 *
 * In this context, networking is provided by the Cevitxe `connection` class.
 *
 * The document to be synced is managed by a `Repo`. Whenever it is changed locally, call
 * `setDoc()` on the Repo. The connection registers a callback on the Repo, and it
 * figures out whenever there are changes that need to be sent to the remote peer.
 *
 * To do this, we keep track of two clocks: ours and theirs.
 *
 * - "Their" clock is the most recent VClock that we think the peer has (either because they've told
 *   us that it's their clock, or because it corresponds to a state we have sent to them on this
 *   connection). Thus, everything more recent than theirClock should be sent to the peer.
 *
 * - "Our" clock is the most recent VClock that we've advertised to the peer (i.e. where we've told
 *   the peer that we have it).
 *
 * > Note: This class began life as a vendored & refactored copy of the `Automerge.Connection`
 * > class; if you're familiar with that class, this one plays exactly the same role.
 */
export class RepoSync {
  public repo: Repo<any>
  private send: (msg: Message) => void
  private clock: Clocks

  /**
   * @param repo An `Automerge.Repo` containing the document being synchronized.
   * @param send Callback function, called when the local document changes. Should send the given
   * message to the remote peer.
   */
  constructor(repo: Repo<any>, send: (msg: Message) => void) {
    this.repo = repo
    this.send = send
    this.clock = { ours: Map(), theirs: Map() }
  }

  // Public API

  open() {
    log('open', Array.from(this.repo.documentIds))
    for (let documentId of this.repo.documentIds) //
      if (documentId.length) this.registerDoc(documentId)
    this.repo.registerHandler(this.docChanged.bind(this))
  }

  close() {
    log('close')
    this.repo.unregisterHandler(this.docChanged.bind(this))
  }

  // Called by the network stack whenever it receives a message from a peer
  receive({
    documentId,
    clock,
    changes,
  }: {
    documentId: string
    clock: Clock
    changes?: A.Change[]
  }) {
    log('receive', documentId)
    // Record their clock value for this document
    if (clock) this.updateClock(documentId, theirs, clock)

    const weHaveDoc = this.repo.getDoc(documentId) !== undefined

    // If they sent changes, apply them to our document
    if (changes) this.repo.applyChanges(documentId, changes)
    // If no changes, treat it as a request for our latest changes
    else if (weHaveDoc) this.maybeSendChanges(documentId)
    // If no changes and we don't have the document, treat it as an advertisement and request it
    else this.advertise(documentId)

    // Return the current state of the document
    return this.repo.getDoc(documentId)
  }

  // Private methods

  private registerDoc(documentId: string) {
    log('registerDoc', documentId)

    const clock = this.getClockFromDoc(documentId)
    this.validateDoc(documentId, clock)
    // Advertise the document
    this.requestChanges(documentId, clock)
    // Record the doc's initial clock
    this.updateClock(documentId, ours, clock)
  }

  private validateDoc(documentId: string, clock: Clock) {
    const ourClock = this.getClock(documentId, ours)

    // Make sure doc has a clock (i.e. is an automerge object)
    if (!clock) throw new TypeError(ERR_NOCLOCK)

    // Make sure the document is newer than what we already have
    if (!lessOrEqual(ourClock, clock)) {
      throw new RangeError(ERR_OLDCLOCK)
    }
  }

  // Callback that is called by the repo whenever a document is changed
  private docChanged(documentId: string) {
    log('doc changed')
    const clock = this.getClockFromDoc(documentId)
    this.validateDoc(documentId, clock)
    this.maybeSendChanges(documentId)
    this.maybeRequestChanges(documentId, clock)
    this.updateClock(documentId, ours, clock)
  }

  // Send changes if we have more recent information than they do
  private maybeSendChanges(documentId: string) {
    const theirClock = (this.getClock(documentId, theirs) as unknown) as A.Clock
    if (theirClock === undefined) return

    const ourState = this.getState(documentId)

    // If we have changes they don't have, send them
    const changes = A.Backend.getMissingChanges(ourState!, theirClock)
    if (changes.length > 0) this.sendChanges(documentId, changes)
  }

  private sendChanges(documentId: string, changes: A.Change[]) {
    const clock = this.getClockFromDoc(documentId)
    this.send({ documentId, clock: clock.toJS(), changes })
    this.updateClock(documentId, ours)
  }

  // Request changes if we're out of date
  private maybeRequestChanges(documentId: string, clock = this.getClockFromDoc(documentId)) {
    const ourClock = this.getClock(documentId, ours)
    // If the document is newer than what we have, request changes
    if (!lessOrEqual(clock, ourClock)) this.requestChanges(documentId, clock)
  }

  // A message with no changes and a clock is a request for changes
  private requestChanges(documentId: string, clock = this.getClockFromDoc(documentId)) {
    this.send({ documentId, clock: clock.toJS() })
  }

  // A message with a documentId and an empty clock is an advertisement for the document
  // (if we have it) or a request for the document (if we don't)
  private advertise(documentId: string) {
    this.send({ documentId, clock: {} })
  }

  // overloads
  getClock(documentId: string, which: 'ours'): Clock
  getClock(documentId: string, which: 'theirs'): Clock | undefined
  // implementation
  getClock(documentId: string, which: keyof Clocks): Clock | undefined {
    const initialClockValue =
      which === ours
        ? (Map() as Clock) // our default clock value is an empty clock
        : undefined // their default clock value is undefined
    return this.clock[which].get(documentId, initialClockValue)
  }

  private getClockFromDoc = (documentId: string) => {
    const state = this.getState(documentId) as any
    if (state === undefined) return
    else return state.getIn(['opSet', 'clock'])
  }

  // Updates the vector clock by merging in the new vector clock `clock`, setting each node's
  // sequence number has been set to the maximum for that node.
  private updateClock(
    documentId: string,
    which: keyof Clocks,
    clock = this.getClockFromDoc(documentId)
  ) {
    const clockMap = this.clock[which]
    const oldClock = clockMap.get(documentId, Map() as Clock)
    // Merge the clocks, keeping the maximum sequence number for each node
    const largestWins = (x: number = 0, y: number = 0): number => Math.max(x, y)
    const newClock = oldClock.mergeWith(largestWins, clock)
    this.clock[which] = clockMap.set(documentId, newClock)
  }

  private getState(documentId: string) {
    const doc = this.repo.getDoc(documentId)
    if (doc) return A.Frontend.getBackendState(doc)
  }
}

const ERR_OLDCLOCK = 'Cannot pass an old state object to a connection'
const ERR_NOCLOCK =
  'This object cannot be used for network sync. ' +
  'Are you trying to sync a snapshot from the history?'

const ours = 'ours'
const theirs = 'theirs'