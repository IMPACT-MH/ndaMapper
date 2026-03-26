import React from "react";
import { Table } from "lucide-react";
import { NDA_DATA_STRUCTURES } from "@/const";

interface DownloadTemplateButtonProps {
  shortName: string;
}

const DownloadTemplateButton = ({ shortName }: DownloadTemplateButtonProps) => {
  const download = () => {
    window.location.href = `${NDA_DATA_STRUCTURES}/${shortName}/template`;
  };

  return (
    <button
      onClick={download}
      className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
      title="Download Submission Template"
    >
      <Table className="w-5 h-5 text-blue-600" />
      <span className="text-sm">Submission Template</span>
    </button>
  );
};

export default DownloadTemplateButton;
