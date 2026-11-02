import Vue from 'vue'
import BookListView from '@/components/app/BookListView.vue'
import { mutations as globalMutations } from '@/store/globals'

function book(id, numTracks = 1) {
  return {
    id,
    libraryId: 'library-1',
    mediaType: 'book',
    media: { metadata: { title: id, authorName: 'Author' }, numTracks }
  }
}

function mountList({ items = [book('book-1'), book('book-2'), { ...book('series-book'), collapsedSeries: { id: 'series-1' } }, book('ebook', 0)], total = items.length, canUpdate = true, processingBatch = false, get } = {}) {
  const state = Vue.observable({
    libraries: { currentLibraryId: 'library-1' },
    user: { settings: { listCoverSize: 40 } },
    globals: { selectedMediaItems: [] },
    processingBatch
  })
  const commit = cy.spy((name, payload) => {
    if (name.startsWith('globals/')) globalMutations[name.slice(8)](state.globals, payload)
  })
  const push = cy.spy()
  const socket = { on: cy.spy(), off: cy.spy() }
  const fetch = get || cy.stub().resolves({ results: items, total })
  let wrapper
  cy.mount(BookListView, {
    attrs: { style: 'height: 300px' },
    parentComponent: { data: () => ({ socket }) },
    stubs: { 'widgets-abridged-indicator': true, 'widgets-explicit-indicator': true },
    mocks: {
      $store: {
        state,
        getters: {
          'user/getUserCanUpdate': canUpdate,
          'libraries/getCurrentLibraryMediaType': 'book',
          'libraries/getCurrentLibrary': { folders: [] },
          'globals/getLibraryItemCoverSrc': () => '/book_placeholder.jpg'
        },
        commit
      },
      $router: { push },
      $axios: { $get: fetch },
      $eventBus: new Vue()
    }
  }).then((result) => {
    wrapper = result.wrapper
  })
  return { state, commit, push, socket, fetch, getWrapper: () => wrapper }
}

describe('BookListView selection and editing', () => {
  it('opens books and collapsed series without entering selection mode', () => {
    const { push } = mountList()
    cy.get('&bookRow').eq(0).click()
    cy.then(() => expect(push).to.have.been.calledWith('/item/book-1'))
    cy.get('&bookRow').eq(2).click()
    cy.then(() => expect(push).to.have.been.calledWith('/library/library-1/series/series-1'))
  })

  it('shares selection with the batch toolbar, selects rows, and clears reactively', () => {
    const { state, push } = mountList()
    cy.get('&selectItem').first().click()
    cy.get('&bookRow').first().should('have.attr', 'aria-selected', 'true')
    cy.get('&editItem').should('not.exist')
    cy.get('&bookRow').eq(1).click()
    cy.then(() => {
      expect(state.globals.selectedMediaItems).to.deep.equal([
        { id: 'book-1', mediaType: 'book', hasTracks: true },
        { id: 'book-2', mediaType: 'book', hasTracks: true }
      ])
      expect(push).not.to.have.been.called
    })
    cy.get('&selectItem').first().focus().type('{esc}')
    cy.get('&selectItem').filter(':checked').should('have.length', 0)
    cy.get('&editItem').should('have.length', 3)
    cy.get('&bookRow').eq(1).click()
    cy.then(() => expect(push).to.have.been.calledWith('/item/book-2'))
  })

  it('selects and deselects ranges, excluding collapsed series and recognizing ebooks', () => {
    const { state, push } = mountList()
    cy.get('&selectItem').should('have.length', 3).first().click()
    cy.get('&bookRow').last().click({ shiftKey: true })
    cy.then(() => {
      expect(state.globals.selectedMediaItems.map((item) => item.id)).to.deep.equal(['book-1', 'book-2', 'ebook'])
      expect(state.globals.selectedMediaItems[2].hasTracks).to.equal(false)
    })
    cy.get('&bookRow').eq(2).click()
    cy.then(() => {
      expect(state.globals.selectedMediaItems).to.have.length(3)
      expect(push).not.to.have.been.called
    })
    cy.get('&selectItem').first().click({ shiftKey: true })
    cy.get('&selectItem').filter(':checked').should('have.length', 0)
  })

  it('opens the existing editor with navigation limited to individual books', () => {
    const { commit, push } = mountList()
    cy.get('&editItem').first().click()
    cy.then(() => {
      expect(commit).to.have.been.calledWith('setBookshelfBookIds', ['book-1', 'book-2', 'ebook'])
      expect(commit).to.have.been.calledWith('showEditModalOnTab', { libraryItem: book('book-1'), tab: 'details' })
      expect(push).not.to.have.been.called
    })
  })

  it('allows selection but not editing without update permission', () => {
    const { commit, state, getWrapper } = mountList({ canUpdate: false })
    cy.get('&editItem').should('not.exist')
    cy.then(() => getWrapper().vm.editItem(book('book-1')))
    cy.then(() => expect(commit).not.to.have.been.called)
    cy.get('&selectItem').first().click()
    cy.then(() => expect(state.globals.selectedMediaItems).to.have.length(1))
  })

  it('blocks selection, editing, and navigation while a batch operation is processing', () => {
    const { state, commit, push, getWrapper } = mountList({ processingBatch: true })
    cy.get('&selectItem').first().should('be.disabled')
    cy.get('&editItem').first().should('be.disabled')
    cy.get('&bookRow').first().click()
    cy.then(() => {
      getWrapper().vm.selectItem(book('book-1'))
      getWrapper().vm.editItem(book('book-1'))
      expect(state.globals.selectedMediaItems).to.have.length(0)
      expect(commit).not.to.have.been.called
      expect(push).not.to.have.been.called
    })
  })

  it('preserves selection and supports ranges across loaded pages', () => {
    const items = Array.from({ length: 100 }, (_, index) => book(`book-${index}`))
    const get = cy.stub()
    get.onFirstCall().resolves({ results: items, total: 102 })
    get.onSecondCall().resolves({ results: [book('book-100'), book('book-101')], total: 102 })
    const { state } = mountList({ items, total: 102, get })
    cy.get('&selectItem').first().click()
    cy.get('#bookshelf').scrollTo('bottom')
    cy.get('&bookRow').should('have.length', 102).last().click({ shiftKey: true })
    cy.then(() => {
      expect(state.globals.selectedMediaItems).to.have.length(102)
      expect(get.secondCall.args[0]).to.contain('page=1')
    })
  })

  it('refreshes edited metadata through the existing socket and removes its listeners', () => {
    const { fetch, socket, getWrapper } = mountList()
    cy.get('&bookRow').should('have.length', 4)
    cy.then(() => {
      expect(socket.on).to.have.been.calledWith('item_updated')
      const updated = socket.on.getCalls().find((call) => call.args[0] === 'item_updated').args[1]
      updated({ ...book('other-book'), libraryId: 'other-library' })
      expect(fetch).to.have.been.calledOnce
      fetch.resolves({ results: [{ ...book('book-1'), media: { metadata: { title: 'Edited title' }, numTracks: 1 } }], total: 1 })
      updated(book('book-1'))
    })
    cy.get('&bookRow').should('have.length', 1).and('contain', 'Edited title')
    cy.then(() => {
      getWrapper().destroy()
      expect(socket.off).to.have.been.calledWith('item_updated')
      expect(socket.off).to.have.been.calledWith('items_updated')
      expect(socket.off).to.have.been.calledWith('item_removed')
    })
  })

  it('does not replace refreshed rows with an older in-flight response', () => {
    let resolveOriginal
    const get = cy.stub()
    get.onFirstCall().returns(new Promise((resolve) => { resolveOriginal = resolve }))
    get.onSecondCall().resolves({ results: [book('new-book')], total: 1 })
    const { getWrapper } = mountList({ get })
    cy.then(() => getWrapper().vm.libraryItemUpdated(book('book-1')))
    cy.get('&bookRow').should('have.length', 1).and('contain', 'new-book')
    cy.then(() => resolveOriginal({ results: [book('old-book')], total: 1 }))
    cy.get('&bookRow').should('have.length', 1).and('contain', 'new-book').and('not.contain', 'old-book')
  })

  it('removes deleted books from selection and refreshes the list', () => {
    const { state, fetch, getWrapper } = mountList()
    cy.get('&selectItem').first().click()
    cy.then(() => {
      fetch.resolves({ results: [book('book-2')], total: 1 })
      getWrapper().vm.libraryItemRemoved(book('book-1'))
    })
    cy.get('&bookRow').should('have.length', 1).and('contain', 'book-2')
    cy.then(() => expect(state.globals.selectedMediaItems).to.have.length(0))
  })
})
