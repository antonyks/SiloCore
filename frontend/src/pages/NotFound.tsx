import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="inset-0 min-h-full min-w-full border border-black-200 flex justify-start">
      <div className="flex flex-col content-start border-red-200 text-black font-black text-left">
        <div className="border text-2xl border-red-200 ">Page not found</div>
      </div>
      <div className="flex flex-col border border-red-200 text-black">
        <div className="text-2xl border border-red-200">Page not found</div>
      </div>
    </div>
  );
}
