import React from 'react'
import cx from 'classnames'
import { pluralize } from '../lib/pluralize'
import { useSelector } from 'react-redux'
import { getFilteredTodos } from 'src/redux/selectors'
import { VisibilityFilter } from 'src/types'
import { AddTodo, TodoList, VisibilityFilters, ClearCompletedButton } from '.'

export function Todos() {
  const activeTodos = useSelector(getFilteredTodos(VisibilityFilter.INCOMPLETE))
  const allTodos = useSelector(getFilteredTodos(VisibilityFilter.ALL))
  const activeCount = activeTodos.length
  const hidden = allTodos.length === 0

  return (
    <>
      <header className="header">
        <h1>todos</h1>
        <AddTodo />
      </header>
      <section className={cx({ main: true, hidden })}>
        <TodoList />
      </section>
      <footer className={cx({ footer: true, hidden })}>
        <span className="todo-count">
          <strong>{activeCount}</strong> {pluralize(activeCount, 'item')} left
        </span>
        <VisibilityFilters />
        <ClearCompletedButton />
      </footer>
    </>
  )
}
