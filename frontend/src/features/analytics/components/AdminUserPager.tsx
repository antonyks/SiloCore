import { useRef } from "react";

interface Props {
  pageIndex: number;
  pageSize: number;
  total: number;
  disabled: boolean;
  onPageChange: (pageIndex: number) => void;
}

const buttonClass =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400";

const AdminUserPager: React.FC<Props> = ({
  pageIndex,
  pageSize,
  total,
  disabled,
  onPageChange,
}) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = pageIndex + 1;
  const pageInputRef = useRef<HTMLInputElement>(null);

  const start = total === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, total);
  const firstNumber = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  const pages = Array.from(
    { length: Math.min(5, pageCount - firstNumber + 1) },
    (_, index) => firstNumber + index,
  );

  const goToInputPage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(pageInputRef.current?.value);
    if (
      Number.isSafeInteger(value) &&
      value >= 1 &&
      value <= pageCount &&
      total > 0
    ) {
      onPageChange(value - 1);
    } else {
      if (pageInputRef.current)
        pageInputRef.current.value = String(currentPage);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
      <span>
        Showing {start}–{end} of {total} users
      </span>
      <nav
        aria-label="User pages"
        className="flex flex-wrap items-center gap-1.5"
      >
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || pageIndex === 0}
          onClick={() => onPageChange(0)}
        >
          First
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || pageIndex === 0}
          onClick={() => onPageChange(pageIndex - 1)}
        >
          Previous
        </button>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            className={buttonClass}
            aria-current={page === currentPage ? "page" : undefined}
            disabled={disabled}
            onClick={() => onPageChange(page - 1)}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || currentPage >= pageCount}
          onClick={() => onPageChange(pageIndex + 1)}
        >
          Next
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || currentPage >= pageCount}
          onClick={() => onPageChange(pageCount - 1)}
        >
          Last
        </button>
      </nav>
      <form
        noValidate
        onSubmit={goToInputPage}
        className="flex items-center gap-2"
      >
        <span>
          Page {currentPage} of {pageCount}
        </span>
        <label htmlFor="user-page-input">Go to page</label>
        <input
          key={currentPage}
          ref={pageInputRef}
          id="user-page-input"
          type="number"
          min={1}
          max={pageCount}
          defaultValue={currentPage}
          disabled={disabled || total === 0}
          className="h-8 w-16 rounded-md border border-slate-300 px-2 text-sm"
        />
        <button
          type="submit"
          className={buttonClass}
          disabled={disabled || total === 0}
        >
          Go
        </button>
      </form>
    </div>
  );
};

export default AdminUserPager;
