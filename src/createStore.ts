import automerge, { DocSet, Message, Change } from 'automerge'
import hypercore from 'hypercore'
import db from 'random-access-idb'
import * as Redux from 'redux'
import signalhub from 'signalhub'
import webrtcSwarm from 'webrtc-swarm'

import { actions } from './actions'
import { adaptReducer } from './adaptReducer'
import { automergify } from './automergify'
import debug from './debug'
import { getMiddleware } from './getMiddleware'
import { mockCrypto } from './mockCrypto'
import { CreateStoreOptions } from './types'
import { DOC_ID } from './constants'
import { CevitxeConnection } from './connection'
import { DeepPartial } from 'redux'

const log = debug('cevitxe:createStore')

const defaultPeerHubs = ['https://signalhub-jccqtwhdwc.now.sh/'] // default public signaling server
const valueEncoding = 'utf-8'
const crypto = mockCrypto

import { useKeychain } from './useKeychain'

export const createStore = async <T>({
  databaseName = 'cevitxe-data',
  peerHubs = defaultPeerHubs,
  proxyReducer,
  defaultState,
  middlewares = [],
  discoveryKey,
}: CreateStoreOptions<T>): Promise<Redux.Store> => {
  const { key, secretKey } = useKeychain(discoveryKey)

  // Init an indexedDB
  const storeName = `${databaseName}-${key.substr(0, 12)}`
  const storage = db(storeName)

  // Create a new hypercore feed
  const feed: Feed<string> = hypercore(storage, key, { secretKey, valueEncoding, crypto })
  feed.on('error', (err: any) => console.error(err))

  const feedReady = new Promise(yes => feed.on('ready', () => yes()))
  await feedReady

  log.groupCollapsed(`feed ready; ${feed.length} stored changes`)

  // if keys
  // - join swarm
  // - intialize store using peer snapshot?
  // - what if we have a local store already with this key?

  // if no keys
  // - generate keys
  // - iniialize store from default state
  // - create store
  // - join swarm

  // This check is why `createStore` is async: we don't know if the feed has changes until `feed.on('ready')`.
  const state: DocSet<T> = feed.length // If there are already changes in the feed (e.g. from storage),
    ? await rehydrateFrom(feed) // use those changes to reconstruct our state;
    : initialize(feed, defaultState) // otherwise this is our first time, so we start with default state.

  // Create Redux store
  const reducer = adaptReducer(proxyReducer)
  const enhancer = Redux.applyMiddleware(...middlewares, getMiddleware(feed))
  const store = Redux.createStore(reducer, state as DeepPartial<DocSet<T>>, enhancer)

  const connections: CevitxeConnection[] = []

  // Now that we've initialized the store, it's safe to subscribe to the feed without worrying about race conditions
  const hub = signalhub(discoveryKey, peerHubs)
  const swarm = webrtcSwarm(hub)

  log('joined swarm', key)
  swarm.on('peer', (peer: any, id: any) => {
    log('peer', id, peer)
    connections.push(new CevitxeConnection(state, peer))
  })

  const start = feed.length // skip any items we already read when initializing
  const stream = feed.createReadStream({ start, live: true })

  // Listen for new items the feed and dispatch them to our redux store
  stream.on('data', (_data: string) => {
    const data = Buffer.from(_data)
    const message = JSON.parse(_data) as Message<T>

    // don't confuse `message: {docId, clock, changes}` (generated by automerge.Connection)
    // with `change.message: string` (optionally provided to automerge.change())
    const changeMessages = (message.changes || []).map((c: Change<T>) => c.message)
    log('dispatch from feed', changeMessages)

    connections.forEach(connection => store.dispatch(actions.applyMessage(message, connection)))
  })
  log.groupEnd()
  return store
}

const rehydrateFrom = async <T>(feed: Feed<string>): Promise<DocSet<T>> => {
  const batch = new Promise(yes => feed.getBatch(0, feed.length, (_, data) => yes(data)))
  const data = (await batch) as string[]

  const messages = data.map(d => JSON.parse(d))
  log('rehydrating from stored messages')
  let doc = automerge.init<T>()
  messages.forEach(m => (doc = automerge.applyChanges(doc, m.changes)))
  const state = new DocSet<T>()
  state.setDoc(DOC_ID, doc)
  return state
}

const initialize = <T>(feed: Feed<string>, defaultState: T): DocSet<T> => {
  log('nothing in storage; initializing')
  const doc = automergify(defaultState)
  const changes = automerge.getChanges(automerge.init(), doc)
  // const clock = Frontend.getBackendState(doc).getIn(['opSet', 'clock'])
  // const clock = Frontend.getBackendState(doc).opSet.clock

  const message = {
    docId: DOC_ID,
    clock: {},
    changes,
  }

  feed.append(JSON.stringify(message))
  // changes.forEach(change => feed.append(JSON.stringify(change)))
  const state = new DocSet<T>()
  state.setDoc(DOC_ID, doc)
  return state
}
