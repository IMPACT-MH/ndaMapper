import React from "react";
import { Download, FileText, Table } from "lucide-react";
import { NDA_DATA_STRUCTURES } from "@/const";

const DownloadStructureButton = ({ shortName }) => {
    const download = () => {
        window.location.href = `${NDA_DATA_STRUCTURES}/${shortName}/csv`;
    };

    return (
        <button
            onClick={download}
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
            title="Download Data Structure"
        >
            <FileText className="w-5 h-5 text-blue-600" />
            <span className="text-sm">Data Structure</span>
        </button>
    );
};

export default DownloadStructureButton;
